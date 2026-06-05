<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/api'

const props = defineProps<{
  show: boolean
  folderPath: string
  folderName: string
  poolId?: number
  /** 编辑模式：传入已有分享数据 */
  editShare?: { id: number; label: string; permissions: string } | null
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const label = ref(props.folderName || '')
const loading = ref(false)
const error = ref('')

// 权限状态
const perms = ref({
  preview: true,
  download: true,
  upload: false,
  delete: false,
  edit: false
})

// 从已有分享数据初始化
watch(() => props.editShare, (share) => {
  if (share) {
    label.value = share.label
    const parts = share.permissions.split(',').map(s => s.trim())
    perms.value.preview = parts.includes('preview')
    perms.value.download = parts.includes('download')
    perms.value.upload = parts.includes('upload')
    perms.value.delete = parts.includes('delete')
  }
}, { immediate: true })

watch(() => props.show, (val) => {
  if (val && !props.editShare) {
    label.value = props.folderName || ''
    perms.value = { preview: true, download: true, upload: false, delete: false }
  }
  if (val) error.value = ''
})

function getPermissionsString(): string {
  return Object.entries(perms.value)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(',')
}

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    const permissions = getPermissionsString()
    if (props.editShare) {
      // 编辑模式
      await api.put(`/user/guest-shares/${props.editShare.id}`, {
        label: label.value || props.folderName,
        permissions
      })
    } else {
      // 创建模式
      await api.post('/user/guest-shares', {
        folderPath: props.folderPath,
        storagePoolId: props.poolId,
        label: label.value || props.folderName,
        permissions
      })
    }
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
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">
          {{ editShare ? '编辑访客分享' : '分享至访客模式' }}
        </h3>
        <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
          {{ editShare ? '修改访客分享的权限和显示名称。' : '' }}
          将文件夹 <span class="font-mono" style="color: var(--accent-color)">{{ folderName }}</span> 分享至访客模式。
        </p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">显示名称</label>
            <input v-model="label" type="text" class="input-field" placeholder="访客看到的文件夹名称" />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2" style="color: var(--text-color)">访客权限</label>
            <div class="space-y-2.5">
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.preview" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">预览文件</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（图片、视频、音频、PDF、代码）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.download" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">下载文件</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.upload" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">上传文件</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（可向文件夹上传新文件）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.edit" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">编辑文件</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（可编辑文本/代码文件内容）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.delete" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">删除文件</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（可删除文件夹内的文件）</span>
              </label>
            </div>
          </div>

          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-3 mt-5">
          <button @click="emit('close')" class="btn-secondary text-sm">取消</button>
          <button @click="handleSubmit" class="btn-primary text-sm" :disabled="loading">
            <span v-if="loading">{{ editShare ? '保存中...' : '分享中...' }}</span>
            <span v-else>{{ editShare ? '保存' : '确认分享' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
