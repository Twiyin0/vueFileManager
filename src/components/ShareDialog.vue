<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  poolId?: number
  fileType?: 'file' | 'folder'
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const password = ref('')
const usePassword = ref(false)
const expiresIn = ref<number | ''>('')
const maxDownloads = ref<number | ''>('')
const loading = ref(false)
const shareResult = ref<{ shareCode: string; url: string; signUrl: string; signKey: string } | null>(null)
const copied = ref(false)
const copyType = ref<'link' | 'sign'>('link')

const origin = window.location.origin

const expirationOptions = [
  { value: '', label: t('share.neverExpire', 'Never Expires') },
  { value: 1, label: '1 ' + t('share.hour', 'hour') },
  { value: 24, label: '1 ' + t('share.day', 'day') },
  { value: 72, label: '3 ' + t('share.day', 'day') },
  { value: 168, label: '7 ' + t('share.day', 'day') },
  { value: 720, label: '30 ' + t('share.day', 'day') }
]

async function createShare() {
  loading.value = true
  try {
    const res = await api.post<{ shareCode: string; url: string; signUrl: string; signKey: string }>('/share/create', {
      filePath: props.filePath,
      fileType: props.fileType || 'file',
      storagePoolId: props.poolId,
      password: usePassword.value ? password.value : undefined,
      expiresIn: expiresIn.value || undefined,
      maxDownloads: maxDownloads.value || undefined
    })
    shareResult.value = res
  } catch (err: any) {
    alert(err.message)
  } finally {
    loading.value = false
  }
}

async function copyLink(type: 'link' | 'sign') {
  if (!shareResult.value) return
  copyType.value = type
  const url = type === 'sign'
    ? `${origin}${shareResult.value.signUrl}`
    : `${origin}${shareResult.value.url}`

  try {
    await navigator.clipboard.writeText(url)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.cssText = 'position:fixed;left:-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  copied.value = true
  setTimeout(() => {
    copied.value = false
    close()
  }, 800)
}

function close() {
  shareResult.value = null
  password.value = ''
  usePassword.value = false
  expiresIn.value = ''
  maxDownloads.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="close" />
      <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto" style="padding: 1.5rem">
        <template v-if="shareResult">
          <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('share.createdTitle', 'Share Link Created') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('share.fileLabel', 'File: {name}').replace('{name}', fileName) }}
          </p>

          <div class="mb-3 rounded-lg p-3" style="background-color: var(--hover-color)">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('share.signedLink', 'Share link (signed access required)') }}</p>
            <p class="break-all font-mono text-sm" style="color: var(--text-color)">{{ origin }}{{ shareResult.signUrl }}</p>
          </div>

          <div class="mb-3 rounded-lg p-3" style="background-color: var(--hover-color)">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('share.signKey', 'Signature key (signKey)') }}</p>
            <p class="font-mono text-sm" style="color: var(--text-color)">{{ shareResult.signKey }}</p>
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">
              {{ t('share.signKeyHint', 'Used to generate temporary signed access. Formula: MD5(username + signKey).slice(4,12) + timestamp') }}
            </p>
          </div>

          <div v-if="usePassword && password" class="mb-3 rounded-lg p-3" style="background-color: var(--hover-color)">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('share.accessPassword', 'Access Password') }}</p>
            <p class="font-mono text-sm" style="color: var(--text-color)">{{ password }}</p>
          </div>

          <div class="flex justify-end gap-3">
            <button class="btn-secondary flex items-center gap-1 text-sm" @click="copyLink('link')">
              <Icon v-if="copied && copyType === 'link'" name="circle-check" class="h-4 w-4" />
              <span>{{ copied && copyType === 'link' ? t('share.copied', 'Copied') : t('share.copyLink', 'Copy Link') }}</span>
            </button>
            <button class="btn-primary flex items-center gap-1 text-sm" @click="copyLink('sign')">
              <Icon v-if="copied && copyType === 'sign'" name="circle-check" class="h-4 w-4" />
              <span>{{ copied && copyType === 'sign' ? t('share.copied', 'Copied') : t('share.copySignedLink', 'Copy Signed Link') }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('share.createTitle', 'Create Share Link') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('share.fileLabel', 'File: {name}').replace('{name}', fileName) }}
          </p>

          <div class="space-y-4">
            <div>
              <label class="flex cursor-pointer items-center justify-between">
                <span class="text-sm" style="color: var(--text-color)">{{ t('share.passwordProtection', 'Password Protection') }}</span>
                <div class="relative inline-flex items-center">
                  <input v-model="usePassword" type="checkbox" class="peer sr-only" />
                  <div class="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full dark:bg-dark-border"></div>
                </div>
              </label>
              <input
                v-if="usePassword"
                v-model="password"
                type="text"
                class="input-field mt-2"
                :placeholder="t('share.passwordPlaceholder', 'Set access password')"
              />
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('share.expiration', 'Expiration') }}</label>
              <select v-model="expiresIn" class="input-field">
                <option v-for="option in expirationOptions" :key="option.label" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('share.maxDownloads', 'Max Downloads') }}</label>
              <input
                v-model="maxDownloads"
                type="number"
                min="1"
                class="input-field [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                :placeholder="t('share.maxDownloadsPlaceholder', 'Leave empty for unlimited')"
              />
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="close">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" :disabled="loading" @click="createShare">
              <span v-if="loading">{{ t('share.creating', 'Creating...') }}</span>
              <span v-else>{{ t('share.createAction', 'Create Share') }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
