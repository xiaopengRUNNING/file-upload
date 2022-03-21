<template>
  <div class="progress-container">
    <Loading class="progress-loading" v-show="props.loading"></Loading>
    <div :class="props.progressClassName + ' progress-slider'">{{ text }}</div>
  </div>
</template>

<script setup>
import Loading from './Loading.vue';
import { defineProps } from 'vue';

const props = defineProps({
  progressClassName: String,
  loading: { type: Boolean, default: true },
  text: String
});
</script>

<style lang="less" scoped>
.progress-container {
  border: 2px solid #999;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;

  .progress-loading {
    z-index: 10;
  }

  .progress-slider {
    position: absolute;
    left: 0px;
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
}
</style>
