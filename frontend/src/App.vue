<template>
  <div class="file-upload-container">
    <a-tabs v-model:activeKey="activeKey">
      <a-tab-pane key="1" tab="普通上传">
        <input type="file" @change="handleFileChange" />
        <button @click="fileUpload">start</button>
      </a-tab-pane>
      <a-tab-pane key="2" tab="分片上传">
        <input type="file" @change="handleFileChange" />
        <button @click="uploadChunks">start</button>
        <div v-if="fileChunkList.length" class="file-chunk-list">
          <div
            v-for="(item, index) in file
            ChunkList"
            :key="index"
            class="file-chunk-item"
          >
            {{ index }}
          </div>
        </div>
      </a-tab-pane>
      <a-tab-pane key="3" tab="断点续传">33</a-tab-pane>
      <template #renderTabBar="{ DefaultTabBar, ...props }">
        <component
          :is="DefaultTabBar"
          v-bind="props"
          :style="{ textAlign: 'center' }"
        ></component>
      </template>
    </a-tabs>
  </div>
</template>

<script setup>
import { ref } from '@vue/reactivity';

const SIZE = 1024 * 10;
const fileChunkList = ref([]);
const file = ref({});
const activeKey = ref('1');

function handleFileChange(e) {
  console.log(e);
  if (!e.target.files.length) {
    return;
  }
  [file.value] = e.target.files;
  if (!file) return;

  createFileChunk(file.value);
}

function fileUpload() {
  const formData = new FormData();
  formData.append('file', file.value);
  request({ url: 'http://localhost:3001/upload', data: formData });
}

function request({ url, method = 'post', data, headers = {} }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 9000;
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
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

function createFileChunk(file, size = SIZE) {
  fileChunkList.value = [];
  let cur = 0;
  let hash = 1;
  while (cur < file.size) {
    fileChunkList.value.push({
      file: file.slice(cur, cur + size),
      hash: hash++
    });
    cur += size;
  }
  console.log(fileChunkList.value);
}

// 上传切片
function uploadChunks() {
  asyncPool(4, fileChunkList.value, handlerUpload).then(() => {
    mergeChunks();
  });
}

async function mergeChunks() {
  await request({
    url: 'http://localhost:3001/merge',
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ filename: file.value.name })
  });
}

function handlerUpload(item) {
  const formData = new FormData();
  formData.append('file', item.file);
  formData.append('hash', item.hash);
  formData.append('filename', file.value.name);
  return request({ url: 'http://localhost:3001/chunkUpload', data: formData });
}

function asyncPool(poolLimit, array, hander) {
  let sequence = [].concat(array);
  let promises = sequence.splice(0, poolLimit).map((item, index) => {
    return hander(item, item.hash).then(() => {
      return index;
    });
  });
  return sequence
    .reduce((test, curr) => {
      return test
        .then(() => {
          return Promise.race(promises);
        })
        .then(fastesIndex => {
          promises[fastesIndex] = hander(curr).then(() => {
            return fastesIndex;
          });
        })
        .catch(err => console.error(err));
    }, Promise.resolve())
    .then(() => {
      return Promise.all(promises);
    });
}

// async function handleUpload() {
//   if (!container.file) return;
//   const fileChunkList = createFileChunk(container.file);
//   data = fileChunkList.map(({ file }, index) => ({
//     chunk: file,
//     hash: container.file.name + '-' + index
//   }));
//   console.log(data);
//   await uploadChunks();
//   await mergeRequest();
// }

// async function mergeRequest() {
//   await request({
//     url: 'http://localhost:3001/merge',
//     headers: { 'content-type': 'application/json' },
//     data: JSON.stringify({ filename: container.file.name, size: SIZE })
//   });
// }
</script>

<style lang="less" scoped>
.file-upload-container {
  margin: auto;
  max-width: 66%;
  min-width: 840px;
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
