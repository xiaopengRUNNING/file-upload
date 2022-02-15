<template>
  <div class="file-upload-container">
    <a-upload :showUploadList="false" :customRequest="customRequest">
      <a-button>Upload</a-button>
    </a-upload>
    <div class="file-upload-mode">
      是否切片上传：<a-switch
        size="small"
        :checked="isChunk"
        @change="uploadModeChange"
      />
    </div>
    <div class="file-upload-progress">
      <div class="progress"></div>
    </div>
    <div class="file-chunk-list" v-if="isChunk">
      <div
        class="file-chunk-item"
        v-for="(item, index) in fileChunkList"
        :key="index"
      >
        <div class="chunk-progress"></div>
        <div v-if="false" class="sk-fading-circle">
          <div class="sk-circle1 sk-circle"></div>
          <div class="sk-circle2 sk-circle"></div>
          <div class="sk-circle3 sk-circle"></div>
          <div class="sk-circle4 sk-circle"></div>
          <div class="sk-circle5 sk-circle"></div>
          <div class="sk-circle6 sk-circle"></div>
          <div class="sk-circle7 sk-circle"></div>
          <div class="sk-circle8 sk-circle"></div>
          <div class="sk-circle9 sk-circle"></div>
          <div class="sk-circle10 sk-circle"></div>
          <div class="sk-circle11 sk-circle"></div>
          <div class="sk-circle12 sk-circle"></div>
        </div>
      </div>
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

const uploadModeChange = checked => {
  isChunk.value = checked;
};

// 更新文件分片进度条
const calculateProgress = () => {
  const ele = document.getElementsByClassName('chunk-progress');

  const animation = () => {
    const requestId = window.requestAnimationFrame(animation);
    fileChunkList.value
      .filter(v => v.progress !== 0)
      .map(v => {
        ele[v.chunkIndex].style.width = `${v.progress}%`;
      });

    if (fileChunkList.value.every(v => v.progress === 100)) {
      window.cancelAnimationFrame(requestId);
    }
  };

  animation();
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
      chunkIndex: cur / CHUNK_SIZE,
      status: 'loading',
      progress: 0
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
      let uploadedChunkIndex = fileStatus.result.fileChunk;

      console.log(fileStatus);

      // 文件已上传
      if (fileStatus.result.fileExists) {
        return fileStatus.result.url;
      }

      if (isChunk.value) {
        // 过滤未上传的切片
        let noExistChunkList = [];

        // 有已上传的分片
        if (uploadedChunkIndex && uploadedChunkIndex.length) {
          fileChunkList.value.forEach(v => {
            if (!uploadedChunkIndex.includes(v.chunkIndex + '')) {
              noExistChunkList.push(v);
            } else {
              // 将已上传的分片进度设为100
              v.progress = 100;
            }
          });
        } else {
          noExistChunkList = fileChunkList.value;
        }

        calculateProgress();
        asyncPool(4, noExistChunkList, handlerChunkUpload).then(() => {
          mergeFileChunk();
        });
      } else {
        calculateProgress();
        handerFileUpload(e.file, fileHash.value);
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
const handlerChunkUpload = record => {
  const formData = new FormData();
  formData.append('file', record.chunk);
  formData.append('fileHash', fileHash.value);
  formData.append('chunkNum', fileChunkList.value.length);
  formData.append('chunkIndex', record.chunkIndex);
  return request({
    url: 'http://localhost:3001/chunkUpload',
    data: formData,
    onProgress: saveChunkProgress(record)
  });
};

const saveChunkProgress = chunkRecord => {
  return e => {
    chunkRecord.progress = (e.loaded / e.total) * 100;
  };
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
    return hander(item).then(() => {
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
            promises[fastIndex] = hander(curr).then(() => {
              // 继续将下标返回，以便下一次遍历
              return fastIndex;
            });
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

function request({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = e => e
}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 60000;
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.upload.onprogress = onProgress;
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
.file-upload-container {
  margin: auto;
  max-width: 66%;

  .file-upload-mode {
    margin: 8px 0px;
  }
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
  .file-chunk-list {
    display: flex;
    flex-wrap: wrap;

    .file-chunk-item {
      width: 30px;
      height: 30px;
      background-color: red;
      margin: 0px 4px 4px 0px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;

      .chunk-progress {
        height: 100%;
        width: 0%;
        background-color: blue;
        position: absolute;
        left: 0px;
      }
    }
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

.sk-fading-circle {
  width: 24px;
  height: 24px;
  position: relative;
}

.sk-fading-circle .sk-circle {
  width: 100%;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
}

.sk-fading-circle .sk-circle:before {
  content: '';
  display: block;
  margin: 0 auto;
  width: 15%;
  height: 15%;
  background-color: #333;
  border-radius: 100%;
  -webkit-animation: sk-circleFadeDelay 1.2s infinite ease-in-out both;
  animation: sk-circleFadeDelay 1.2s infinite ease-in-out both;
}
.sk-fading-circle .sk-circle2 {
  -webkit-transform: rotate(30deg);
  -ms-transform: rotate(30deg);
  transform: rotate(30deg);
}
.sk-fading-circle .sk-circle3 {
  -webkit-transform: rotate(60deg);
  -ms-transform: rotate(60deg);
  transform: rotate(60deg);
}
.sk-fading-circle .sk-circle4 {
  -webkit-transform: rotate(90deg);
  -ms-transform: rotate(90deg);
  transform: rotate(90deg);
}
.sk-fading-circle .sk-circle5 {
  -webkit-transform: rotate(120deg);
  -ms-transform: rotate(120deg);
  transform: rotate(120deg);
}
.sk-fading-circle .sk-circle6 {
  -webkit-transform: rotate(150deg);
  -ms-transform: rotate(150deg);
  transform: rotate(150deg);
}
.sk-fading-circle .sk-circle7 {
  -webkit-transform: rotate(180deg);
  -ms-transform: rotate(180deg);
  transform: rotate(180deg);
}
.sk-fading-circle .sk-circle8 {
  -webkit-transform: rotate(210deg);
  -ms-transform: rotate(210deg);
  transform: rotate(210deg);
}
.sk-fading-circle .sk-circle9 {
  -webkit-transform: rotate(240deg);
  -ms-transform: rotate(240deg);
  transform: rotate(240deg);
}
.sk-fading-circle .sk-circle10 {
  -webkit-transform: rotate(270deg);
  -ms-transform: rotate(270deg);
  transform: rotate(270deg);
}
.sk-fading-circle .sk-circle11 {
  -webkit-transform: rotate(300deg);
  -ms-transform: rotate(300deg);
  transform: rotate(300deg);
}
.sk-fading-circle .sk-circle12 {
  -webkit-transform: rotate(330deg);
  -ms-transform: rotate(330deg);
  transform: rotate(330deg);
}
.sk-fading-circle .sk-circle2:before {
  -webkit-animation-delay: -1.1s;
  animation-delay: -1.1s;
}
.sk-fading-circle .sk-circle3:before {
  -webkit-animation-delay: -1s;
  animation-delay: -1s;
}
.sk-fading-circle .sk-circle4:before {
  -webkit-animation-delay: -0.9s;
  animation-delay: -0.9s;
}
.sk-fading-circle .sk-circle5:before {
  -webkit-animation-delay: -0.8s;
  animation-delay: -0.8s;
}
.sk-fading-circle .sk-circle6:before {
  -webkit-animation-delay: -0.7s;
  animation-delay: -0.7s;
}
.sk-fading-circle .sk-circle7:before {
  -webkit-animation-delay: -0.6s;
  animation-delay: -0.6s;
}
.sk-fading-circle .sk-circle8:before {
  -webkit-animation-delay: -0.5s;
  animation-delay: -0.5s;
}
.sk-fading-circle .sk-circle9:before {
  -webkit-animation-delay: -0.4s;
  animation-delay: -0.4s;
}
.sk-fading-circle .sk-circle10:before {
  -webkit-animation-delay: -0.3s;
  animation-delay: -0.3s;
}
.sk-fading-circle .sk-circle11:before {
  -webkit-animation-delay: -0.2s;
  animation-delay: -0.2s;
}
.sk-fading-circle .sk-circle12:before {
  -webkit-animation-delay: -0.1s;
  animation-delay: -0.1s;
}

@-webkit-keyframes sk-circleFadeDelay {
  0%,
  39%,
  100% {
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
}

@keyframes sk-circleFadeDelay {
  0%,
  39%,
  100% {
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
}
</style>
