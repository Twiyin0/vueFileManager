<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'

const props = defineProps<{
  show: boolean
  folderPath: string
  folderName: string
  poolId?: number
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const label = ref(props.folderName || '')
const loading = ref(false)
const error = ref('')

async function handleShare() {
  loading.value = true
  error.value = ''
  try {
    await api.post('/user/guest-shares', {
      folderPath: props.folderPath,
      storagePoolId: props.poolId,
      label: label.value || props.folderName
    })
    emit('done')
    emit('close')
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')"/>
      <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">分享至访客模式</h3>
        <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
          将文件夹 <span class="font-mono" style="color: var(--accent-color)">{{ folderName }}</span> 分享至访客模式，访客可浏览和下载其中的文件。
        </p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">显示名称</label>
            <input v-model="label" type="text" class="input-field" placeholder="访客看到的文件夹名称" />
          </div>

          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-3 mt-5">
          <button @click="emit('close')" class="btn-secondary text-sm">取消</button>
          <button @click="handleShare" class="btn-primary text-sm" :disabled="loading">
            <span v-if="loading">分享中...</span>
            <span v-else>确认分享</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
