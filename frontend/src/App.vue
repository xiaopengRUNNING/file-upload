<template>
  <div class="main-container">
    <a-upload
      :showUploadList="false"
      :beforeUpload="beforeUpload"
      @change="uploadFileChange"
    >
      <a-button>Upload</a-button>
    </a-upload>
    <a class="start-upload-button" @click="customRequest" v-if="!loading">
      开始上传
    </a>
    <div class="err-tip" v-if="showError">请先选择上传文件！</div>
    <div class="file-upload-setting">
      抽样计算md5：
      <a-switch class="switch" size="small" v-model:checked="isSampling" />
    </div>
    <div class="file-upload-setting">
      是否切片上传：
      <a-switch class="switch" size="small" v-model:checked="isChunk" />
    </div>
    <div class="flex-container">
      md5计算进度：
      <Progress
        class="total-progress-container"
        progressClassName="md5-progress"
        :loading="md5Info.status === 'loading'"
      ></Progress>
    </div>
    <div class="flex-container">
      文件上传进度：
      <Progress
        class="total-progress-container"
        progressClassName="total-progress"
        :loading="uploadInfo.status === 'uploading'"
      ></Progress>
    </div>
    <div class="flex-container" v-if="isChunk && fileChunkList.length">
      <div class="file-chunk-label">切片上传进度：</div>
      <div class="file-chunk-list">
        <Progress
          v-for="(item, index) in fileChunkList"
          :key="index"
          class="chunk-progress-container"
          progressClassName="chunk-progress"
          :loading="['start', 'uploading'].includes(item.status)"
        ></Progress>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from '@vue/reactivity';
import sparkMD5 from 'spark-md5';
import request from './utils/request';
import Progress from './components/Progress.vue';
import { str2ab } from './utils/string';

const loading = ref(false);
// 切片大小
const CHUNK_SIZE = 1024 * 100; // 100k
// 当抽样计算文件md5时，从每个分片中截取信息大小
const SAMPLING_SIZE = 10; // 10字节
// 文件分片数组
const fileChunkList = ref([]);
// 文件信息
const file = ref({});
// 是否分片上传
const isChunk = ref(true);
// 是否抽样计算md5
const isSampling = ref(true);
// 文件md5值
const fileHash = ref('');
// 是否显示错误信息
const showError = ref(false);
// 文件上传信息
const uploadInfo = ref({ progress: 0, status: 'init' });
// 计算文件md5信息
const md5Info = ref({
  total: 0,
  progress: 0,
  status: 'init'
});

const beforeUpload = file => {
  console.log(file);
  return false;
};

const uploadFileChange = fileInfo => {
  showError.value = false;
  file.value = fileInfo.file;

  // 清空文件分片
  fileChunkList.value = [];

  uploadInfo.value = { progress: 0, status: 'init' };
};

// 更新进度条
const calculateProgress = () => {
  const chunkProgressList = document.getElementsByClassName('chunk-progress');
  const totalPorgress = document.getElementsByClassName('total-progress')[0];
  const md5Progress = document.getElementsByClassName('md5-progress')[0];

  const animation = () => {
    const requestId = window.requestAnimationFrame(animation);

    if (isChunk.value) {
      // 文件已上传大小
      let uploadedSize = 0;

      // 处理分片上传进度条
      fileChunkList.value
        .filter(v => v.progress !== 0)
        .map(v => {
          chunkProgressList[v.chunkIndex].style.width = `${v.progress}%`;
          if (v.status === 'success') {
            chunkProgressList[v.chunkIndex].classList.add('success');
          }
          if (v.status === 'error') {
            chunkProgressList[v.chunkIndex].classList.add('error');
          }

          uploadedSize = uploadedSize + (v.chunk.size * v.progress) / 100;
        });

      // 计算整个文件上传进度
      uploadInfo.value.progress = (uploadedSize / file.value.size) * 100;
    }

    totalPorgress.style.width = `${uploadInfo.value.progress}%`;
    totalPorgress.classList.add(uploadInfo.value.status);

    md5Progress.style.width = `${md5Info.value.progress}%`;
    md5Progress.classList.add(md5Info.value.status);

    if (
      fileChunkList.value.every(v => ['success', 'error'].includes(v.status)) &&
      uploadInfo.value.status === 'success' &&
      md5Info.value.status === 'success'
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

// 计算文件md5
const calculateFileHash = file => {
  return new Promise((resolve, reject) => {
    let cur = 0;
    let fileReader = new FileReader();
    let spark = new sparkMD5.ArrayBuffer();
    let finishedSize = new Map();

    str2ab(file.name, result => {
      spark.append(result);
    });

    fileReader.onload = e => {
      spark.append(e.target.result);

      if (!isSampling.value || cur > fileChunkList.value.length - 1) {
        resolve(spark.end());
        return;
      }
      calculate();
    };

    fileReader.onerror = () => {
      md5Info.value.status = 'error';
      reject(new Error('文件读取失败'));
    };

    fileReader.onprogress = e => {
      console.log(e);
      finishedSize.set(cur, e.loaded);

      let progress =
        (Array.from(finishedSize.values()).reduce((pre, cur) => pre + cur, 0) /
          md5Info.value.total) *
        100;
      md5Info.value = {
        ...md5Info.value,
        ...{
          progress: progress,
          status: progress === 100 ? 'success' : 'loading'
        }
      };
    };

    const calculate = () => {
      if (isSampling.value) {
        if (cur === 0 || cur === fileChunkList.value.length - 1) {
          // 取文件切片列表首尾完整切片
          fileReader.readAsArrayBuffer(fileChunkList.value[cur].chunk);
        } else {
          // 中间切片首尾各取10个字节
          let blob = new Blob([
            fileChunkList.value[cur].chunk.slice(0, SAMPLING_SIZE),
            fileChunkList.value[cur].chunk.slice(-SAMPLING_SIZE)
          ]);
          fileReader.readAsArrayBuffer(blob);
        }
        cur++;
      } else {
        fileReader.readAsArrayBuffer(file);
      }
    };

    calculate();
  });
};

/**
 * 检查文件上传状态
 *
 * @param {String} fileHash
 */
const checkFileStatus = fileHash => {
  const params = { fileHash: fileHash, fileName: file.value.name };
  uploadInfo.value.status = 'uploading';
  return request({
    url: 'http://localhost:3001/checkFileStatus',
    data: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

const customRequest = () => {
  if (!file.value.name) {
    showError.value = true;
    return;
  }

  loading.value = true;
  // 当抽样计算文件md5或分片上传时才切分文件
  if (isSampling.value || isChunk.value) {
    fileChunk(file.value);
  }

  // 需要计算md5的字节数
  if (isSampling.value && fileChunkList.value.length > 2) {
    md5Info.value.total =
      fileChunkList.value[fileChunkList.value.length - 1].chunk.size +
      CHUNK_SIZE +
      (fileChunkList.value.length - 2) * 2 * SAMPLING_SIZE;
  } else {
    md5Info.value.total = file.value.size;
  }

  // 处理进度条
  calculateProgress();

  calculateFileHash(file.value)
    .then(result => {
      fileHash.value = result;
      return checkFileStatus(result);
    })
    .then(result => {
      let fileStatus = JSON.parse(result.data);
      let uploadedChunkIndex = fileStatus.result.fileChunk;

      // 文件已上传
      if (fileStatus.result.fileExists) {
        fileChunkList.value.forEach(v => {
          v.progress = 100;
          v.status = 'success';
        });
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

        asyncPool(4, noExistChunkList, handlerChunkUpload).then(() => {
          mergeFileChunk()
            .then(() => {
              uploadInfo.value.status = 'success';
            })
            .catch(() => {
              uploadInfo.value.status = 'error';
            })
            .finally(() => {
              loading.value = false;
            });
        });
      } else {
        handerFileUpload(file.value, fileHash.value);
      }
    })
    .catch(err => {
      console.error(err);
      return false;
    })
    .finally(() => {
      loading.value = false;
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
      uploadInfo.value.status = 'uploading';
    },
    onload: () => {
      record.status = 'success';
    },
    onerror: () => {
      record.status = 'error';
    }
  });
};

/**
 * 保存分片上传进度
 */
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
    data: formData,
    onProgress: e => {
      uploadInfo.value.progress = (e.loaded / e.total) * 100;
    },
    onloadstart: () => {
      uploadInfo.value.status = 'uploading';
    },
    onload: () => {
      uploadInfo.value.status = 'success';
    },
    onerror: () => {
      uploadInfo.value.status = 'error';
    }
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
  .file-upload-setting {
    margin: 8px 0px;
  }
  .flex-container {
    display: flex;
    margin: 8px 0px;

    .switch {
      margin-top: -2px;
    }
    .file-chunk-list {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
    }
  }
}
.total-progress-container {
  flex: 1;
  height: 32px;
  margin-right: 4px;
}
.chunk-progress-container {
  width: 30px;
  height: 30px;
  margin: 0px 4px 4px 0px;
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
