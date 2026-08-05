<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  items: Array<{ path: string; name: string; poolId?: number; type?: string }>
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const { t } = useI18n()

const loading = ref(false)
const directories = ref<string[]>([])
const selectedMode = ref<'select' | 'create'>('select')
const selectedTargetPath = ref<string | null>(null)
const newTargetName = ref('')
const error = ref('')

const canSubmit = computed(() => {
  if (selectedMode.value === 'select') return selectedTargetPath.value !== null
  return !!newTargetName.value.trim()
})

async function loadDirectories() {
  const res = await api.get<{ directories: string[] }>('/share-mounts/directories')
  directories.value = Array.isArray(res.directories) ? res.directories : ['']
  if (selectedTargetPath.value === null) {
    selectedTargetPath.value = directories.value[0] ?? ''
  }
}

watch(() => props.show, async (visible) => {
  if (!visible) return
  error.value = ''
  newTargetName.value = ''
  selectedMode.value = 'select'
  selectedTargetPath.value = null
  await loadDirectories()
})

async function handleSubmit() {
  if (!canSubmit.value || loading.value) return

  loading.value = true
  error.value = ''

  try {
    let targetPath = selectedTargetPath.value || ''

    if (selectedMode.value === 'create') {
      targetPath = newTargetName.value.trim().replace(/^\/+|\/+$/g, '')
      await api.post('/share-mounts/directories', { path: targetPath })
    }

    await api.post('/share-mounts/mount', {
      targetPath,
      items: props.items.map((item) => ({
        sourcePoolId: item.poolId,
        sourcePath: item.path
      }))
    })

    emit('done')
    emit('close')
  } catch (err: any) {
    error.value = err.message || t('shareMount.mountFailed', 'Mount failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay">
      <div class="dialog-backdrop" @click="emit('close')" />

      <div class="dialog-panel dialog-panel-scroll dialog-panel-lg">
        <div class="dialog-section">
        <h3 class="dialog-title mb-2">
          {{ t('shareMount.title', 'Cross-Pool Mount') }}
        </h3>

        <p class="dialog-description mb-4">
          {{ t('shareMount.desc', 'Mount the selected folders into the shared cross-pool directory under /share.') }}
        </p>

        <div class="mb-4 grid grid-cols-2 gap-2">
          <button
            class="dialog-choice-card"
            :class="selectedMode === 'select' ? 'dialog-choice-card-active' : ''"
            @click="selectedMode = 'select'"
          >
            {{ t('shareMount.selectFolder', 'Choose Mount Folder') }}
          </button>

          <button
            class="dialog-choice-card"
            :class="selectedMode === 'create' ? 'dialog-choice-card-active' : ''"
            @click="selectedMode = 'create'"
          >
            {{ t('shareMount.createFolder', 'Create Mount Folder') }}
          </button>
        </div>

        <div v-if="selectedMode === 'select'" class="mb-4">
          <label class="dialog-form-label">
            {{ t('shareMount.targetDir', 'Target Mount Directory') }}
          </label>

          <select v-model="selectedTargetPath" class="input-field text-sm">
            <option v-for="dir in directories" :key="dir || 'root'" :value="dir">
              {{ dir ? `/share/${dir}` : '/share' }}
            </option>
          </select>
        </div>

        <div v-else class="mb-4">
          <label class="dialog-form-label">
            {{ t('shareMount.newDirName', 'New Mount Directory Name') }}
          </label>

          <div class="flex items-center gap-2">
            <span
              class="rounded-md border px-3 py-2 text-sm"
              style="border-color: var(--border-color); color: var(--text-secondary-color)"
            >
              /share/
            </span>

            <input
              v-model="newTargetName"
              type="text"
              class="input-field text-sm"
              :placeholder="t('shareMount.newDirPlaceholder', 'For example: abc')"
            />
          </div>
        </div>

        <div
          class="dialog-muted-block-strong mb-4 text-sm"
        >
          <p class="mb-2 font-medium" style="color: var(--text-color)">
            {{ t('shareMount.selectedFolders', 'Folders to Mount') }}
          </p>

          <div
            v-for="item in items"
            :key="`${item.poolId}-${item.path}`"
            class="truncate"
            style="color: var(--text-secondary-color)"
          >
            {{ item.name }} · pool #{{ item.poolId }} · {{ item.path }}
          </div>
        </div>

        <div
          v-if="error"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          {{ error }}
        </div>

        <div class="dialog-footer mt-0">
          <button class="btn-secondary text-sm" @click="emit('close')">
            {{ t('common.cancel', 'Cancel') }}
          </button>

          <button class="btn-primary text-sm" :disabled="loading || !canSubmit" @click="handleSubmit">
            {{ loading ? t('common.loading', 'Loading...') : t('shareMount.confirmMount', 'Confirm Mount') }}
          </button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
