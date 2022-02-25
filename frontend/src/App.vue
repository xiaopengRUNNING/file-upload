<template>
  <div class="main-container">
    <a-upload
      :showUploadList="false"
      :beforeUpload="beforeUpload"
      @change="uploadFileChange"
    >
      <a-button>Upload</a-button>
    </a-upload>
    <a class="start-upload-button" @click="customRequest" :disabled="uploading"
      >开始上传</a
    >
    <div class="err-tip" v-if="showError">请先选择上传文件！</div>
    <div class="file-upload-mode">
      是否切片上传：
      <a-switch
        class="file-upload-mode-switch"
        size="small"
        :checked="isChunk"
        @change="uploadModeChange"
      />
    </div>
    <div
      class="file-chunk-upload-container flex-container"
      v-if="isChunk && !isEmptyObject(file)"
    >
      <div class="file-chunk-label">切片上传进度：</div>
      <div class="file-chunk-list">
        <div
          class="file-chunk-item"
          v-for="(item, index) in fileChunkList"
          :key="index"
        >
          <div class="chunk-progress progress"></div>
          <Loading
            v-show="['start', 'uploading'].includes(item.status)"
          ></Loading>
        </div>
      </div>
    </div>
    <div class="file-upload-container flex-container">
      文件上传进度：
      <div class="file-upload-progress">
        <Loading class="progress-loading" v-if="uploading"></Loading>
        <div class="total-progress progress"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from '@vue/reactivity';
import sparkMD5 from 'spark-md5';
import request from './utils/request';
import Loading from './components/Loading.vue';
import { str2ab } from './utils/string';

// 切片大小
const CHUNK_SIZE = 1024 * 100;
// 文件分片数组
const fileChunkList = ref([]);
// 文件信息
const file = ref({});
// 是否分钱上传
const isChunk = ref(true);
// 文件md5值
const fileHash = ref('');
// 是否显示错误信息
const showError = ref(false);
// 文件分片合并结果
const mergeResult = ref(false);
// 文件上传loading
const uploading = ref(false);

const uploadModeChange = checked => {
  isChunk.value = checked;
};

const beforeUpload = () => {
  return false;
};

const uploadFileChange = fileInfo => {
  showError.value = false;
  file.value = fileInfo.file;
  fileChunk(file.value);
};

// 更新文件分片进度条
const calculateProgress = () => {
  const ele = document.getElementsByClassName('chunk-progress');
  const totalPorgress = document.getElementsByClassName('total-progress')[0];

  const animation = () => {
    const requestId = window.requestAnimationFrame(animation);
    // 文件已上传大小
    let uploadedSize = 0;

    // 处理分片上传进度条
    fileChunkList.value
      .filter(v => v.progress !== 0)
      .map(v => {
        ele[v.chunkIndex].style.width = `${v.progress}%`;
        if (v.status === 'success') {
          ele[v.chunkIndex].classList.add('success');
          // ele[v.chunkIndex].style.backgroundColor = '#52C41A';
        }
        if (v.status === 'error') {
          ele[v.chunkIndex].classList.add('error');
          // ele[v.chunkIndex].style.backgroundColor = '#f5222d';
        }

        uploadedSize = uploadedSize + (v.chunk.size * v.progress) / 100;
      });

    // 计算整个文件上传进度
    totalPorgress.style.width = `${(uploadedSize / file.value.size) * 100}%`;

    if (mergeResult.value) {
      totalPorgress.classList.add('success');
    }

    if (
      fileChunkList.value.every(v => ['success', 'error'].includes(v.status)) &&
      mergeResult.value
    ) {
      window.cancelAnimationFrame(requestId);
    }
  };

  animation();
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
      // 'init', 'start', 'uploading', 'error', 'success'
      status: 'init',
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
      console.log(e);
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

const customRequest = () => {
  if (isEmptyObject(file.value)) {
    showError.value = true;
    return;
  }

  uploading.value = true;

  fileChunkHash(file.value)
    .then(result => {
      fileHash.value = result;
      return checkFileStatus(result);
    })
    .then(result => {
      let fileStatus = JSON.parse(result.data);
      let uploadedChunkIndex = fileStatus.result.fileChunk;

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
              v.status = 'success';
            }
          });
        } else {
          noExistChunkList = fileChunkList.value;
        }

        calculateProgress();
        asyncPool(4, noExistChunkList, handlerChunkUpload).then(() => {
          mergeFileChunk().then(() => {
            mergeResult.value = true;
            uploading.value = false;
          });
        });
      } else {
        calculateProgress();
        handerFileUpload(file.value, fileHash.value);
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
  return request({
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
    onProgress: saveChunkProgress(record),
    onloadstart: () => {
      record.status = 'start';
    },
    onload: () => {
      record.status = 'success';
    },
    onerror: () => {
      record.status = 'error';
    }
  });
};

const saveChunkProgress = chunkRecord => {
  return e => {
    chunkRecord.status = 'uploading';
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

/**
 * 判断是否为空对象
 */
function isEmptyObject(obj) {
  if (Object.prototype.toString.call({}) !== '[object Object]') {
    return false;
  }
  return Object.keys(obj).length ? false : true;
}
</script>

<style lang="less" scoped>
.main-container {
  width: 608px;
  max-width: 100%;
  margin: auto;
  text-align: left;

  .start-upload-button {
    margin-left: 8px;
  }
  .err-tip {
    color: red;
    margin-top: 4px;
  }
  .file-upload-mode {
    margin: 8px 0px;

    .file-upload-mode-switch {
      margin-top: -2px;
    }
  }
  .file-chunk-upload-container {
    .file-chunk-list {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      .file-chunk-item {
        width: 30px;
        height: 30px;
        border: 2px solid #999;
        border-radius: 4px;
        margin: 0px 4px 4px 0px;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;

        .chunk-progress {
          position: absolute;
          left: 0px;
        }
      }
    }
  }
  .file-upload-container {
    .file-upload-progress {
      flex: 1;
      height: 32px;
      border: 2px solid #999;
      border-radius: 4px;
      margin-right: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;

      .total-progress {
        position: absolute;
        left: 0px;
      }
      .progress-loading {
        z-index: 10;
      }
    }
  }
  .flex-container {
    display: flex;
    margin: 8px 0px;
  }
}
.progress {
  height: 100%;
  width: 0;
  background-color: #1890ff;
  &.success {
    background-color: #52c41a;
  }
  &.error {
    background-color: #f5222d;
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
