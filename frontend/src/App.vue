<template>
  <div class="file-upload-container">
    <a-upload :showUploadList="false" :customRequest="customRequest">
      <a-button>Upload</a-button>
    </a-upload>
    <div>
      是否切片上传：<a-switch
        size="small"
        :checked="isChunk"
        @change="uploadModeChange"
      />
    </div>
    <div>
      <a-progress
        :percent="fileProgress"
        style="width: 200px"
        :showInfo="false"
      ></a-progress>
    </div>
    <div class="file-upload-progress">
      <div class="progress"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from '@vue/reactivity';
import sparkMD5 from 'spark-md5';

const CHUNK_SIZE = 1024 * 100;
const fileChunkList = ref([]);
const file = ref({});
const fileProgress = ref();
const isChunk = ref(true);
let fileHash = ref('');

const calculateProgress = () => {
  const ele = document.getElementsByClassName('progress');

  const animation = () => {
    const requestId = window.requestAnimationFrame(test);
    ele[0].style.width = `${fileProgress.value}%`;

    if (fileProgress.value >= 100) {
      window.cancelAnimationFrame(requestId);
    }
  };

  animation();
};

const uploadModeChange = checked => {
  isChunk.value = checked;
};

/**
 * 字符串转ArrayBuffer
 */
const str2ab = (str, fn) => {
  let b = new Blob([str], { type: 'text/plain:charset=utf-8' });
  let r = new FileReader();
  r.readAsArrayBuffer(b);
  r.onload = e => {
    fn(e.target.result);
  };
};

/**
 * 文件切片
 */
const fileChunk = file => {
  let cur = 0;
  while (cur < file.size) {
    fileChunkList.value.push({
      chunk: file.slice(cur, cur + CHUNK_SIZE),
      chunkIndex: cur / CHUNK_SIZE
    });
    cur += CHUNK_SIZE;
  }
  console.log(fileChunkList.value);
};

/**
 * 计算文件切片hash值
 */
const fileChunkHash = file => {
  return new Promise((resolve, reject) => {
    let cur = 0;
    let fileReader = new FileReader();
    let spark = new sparkMD5.ArrayBuffer();

    // 计算文件名hash值，防止文件相同文件名不同的情况
    str2ab(file.name, result => {
      spark.append(result);
    });

    fileReader.onload = e => {
      spark.append(e.target.result);
      if (cur <= fileChunkList.value.length - 1) {
        calculateChunk();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onprogress = e => {
      // console.log(e);
    };

    fileReader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    const calculateChunk = () => {
      fileReader.readAsArrayBuffer(fileChunkList.value[cur].chunk);
      cur++;
    };

    calculateChunk();
  });
};

/**
 * 检查文件上传状态
 *
 * @param {String} fileHash
 */
const checkFileStatus = fileHash => {
  const params = { fileHash: fileHash, fileName: file.value.name };
  return request({
    url: 'http://localhost:3001/checkFileStatus',
    data: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

const customRequest = e => {
  file.value = e.file;

  fileChunk(e.file);

  fileChunkHash(e.file)
    .then(result => {
      fileHash.value = result;
      return checkFileStatus(result);
    })
    .then(result => {
      let fileStatus = JSON.parse(result.data);
      console.log(fileStatus);

      if (fileStatus.result.fileExists) {
        return fileStatus.result.url;
      }

      if (isChunk.value) {
        // 过滤未上传的切片
        let noExistChunkList = fileStatus.result.fileChunk.length
          ? fileChunkList.value.filter(
              v => !fileStatus.result.fileChunk.includes(v.chunkIndex + '')
            )
          : fileChunkList.value;

        asyncPool(4, noExistChunkList, handlerChunkUpload).then(() => {
          mergeFileChunk();
        });
      } else {
        handerFileUpload(e.file, fileHash.value);
        calculateProgress();
      }
    })
    .catch(err => {
      console.error(err);
      return false;
    });
};

/**
 * 切片合并
 */
const mergeFileChunk = () => {
  const params = {
    fileHash: fileHash.value,
    fileName: file.value.name,
    chunkSize: CHUNK_SIZE
  };
  request({
    url: 'http://localhost:3001/mergeFile',
    data: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

/**
 * 切片上传
 *
 * @param {File} chunk 切片文件
 * @param {Number} index 此切片在切片数组中的索引
 */
const handlerChunkUpload = (chunk, index) => {
  const formData = new FormData();
  formData.append('file', chunk);
  formData.append('fileHash', fileHash.value);
  formData.append('chunkNum', fileChunkList.value.length);
  formData.append('chunkIndex', index);
  return request({
    url: 'http://localhost:3001/chunkUpload',
    data: formData
  });
};

/**
 * 文件上传
 *
 * @param {File} chunk 文件信息
 */
const handerFileUpload = (file, fileHash) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileHash', fileHash);
  return request({
    url: 'http://localhost:3001/upload',
    data: formData
  });
};

/**
 * 限制异步请求最大并发数
 *
 * @param {Number} poolLimit
 * @param {Array} array
 * @param {Function} hander
 */
function asyncPool(poolLimit, array, hander) {
  let sequence = [].concat(array);
  let promises = sequence.splice(0, poolLimit).map((item, index) => {
    return hander(item.chunk, item.chunkIndex).then(() => {
      // 异步请求完成后返回在promises中的下标
      return index;
    });
  });
  return sequence
    .reduce((aPromise, curr) => {
      return (
        aPromise
          .then(() => {
            // 返回第一个完成的异步请求在promises中的下标
            return Promise.race(promises);
          })
          .then(fastIndex => {
            // 替换已完成的异步请求
            promises[fastIndex] = hander(curr.chunk, curr.chunkIndex).then(
              () => {
                // 继续将下标返回，以便下一次遍历
                return fastIndex;
              }
            );
          })
          // 异常捕获
          .catch(err => console.error(err))
      );
    }, Promise.resolve())
    .then(() => {
      // 将sequence中的异步请求执行完毕后，剩下的使用.all调用
      return Promise.all(promises);
    });
}

function request({ url, method = 'post', data, headers = {} }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 60000;
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.upload.onprogress = e => {
      let percentage = e.loaded / e.total;
      fileProgress.value = percentage * 100;
    };
    xhr.send(data);
    xhr.onload = e => {
      console.log(e);
      resolve({
        data: e.target.response
      });
    };
    xhr.onerror = err => {
      reject(err);
    };
  });
}
</script>

<style lang="less" scoped>
.file-upload-progress {
  height: 32px;
  width: 200px;
  border: 1px solid black;
  margin: auto;

  .progress {
    height: 100%;
    width: 0;
    background-color: black;
  }
}
.file-upload-container {
  margin: auto;
  max-width: 66%;
}
.file-chunk-list {
  display: flex;
  justify-content: center;

  .file-chunk-item {
    width: 30px;
    height: 30px;
    background-color: red;
  }
}
</style>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  padding-top: 60px;
}
</style>
