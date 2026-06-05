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

// 权限状态（四级权限体系）
const perms = ref({
  read: true,
  write: false,
  delete: false,
  edit: false
})

// 从已有分享数据初始化（兼容旧权限格式）
watch(() => props.editShare, (share) => {
  if (share) {
    label.value = share.label
    const parts = share.permissions.split(',').map(s => s.trim())
    // 新格式直接读取
    perms.value.read = parts.includes('read') || parts.includes('preview') || parts.includes('download')
    perms.value.write = parts.includes('write') || parts.includes('upload')
    perms.value.delete = parts.includes('delete')
    perms.value.edit = parts.includes('edit')
  }
}, { immediate: true })

watch(() => props.show, (val) => {
  if (val && !props.editShare) {
    label.value = props.folderName || ''
    perms.value = { read: true, write: false, delete: false, edit: false }
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
                <input type="checkbox" v-model="perms.read" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">读取</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（预览、下载文件）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.write" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">写入</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（上传文件）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.delete" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">删除</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（删除文件与文件夹）</span>
              </label>
              <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="perms.edit" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">文件编辑</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">（编辑文件内容、重命名）</span>
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
