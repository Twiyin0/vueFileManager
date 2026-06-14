<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import type { DatabaseConfigForm, DatabaseStatus } from '@/composables/useAdminPage'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  uploadLimit: number
  maxConcurrentUploads: number
  databaseSaving: boolean
  databaseTesting: boolean
  databaseMessage: string
  databaseMessageType: 'success' | 'error' | 'info'
  databaseStatus: DatabaseStatus | null
}>()

defineEmits<{
  openUploadLimit: []
  saveDatabase: []
  testDatabase: []
}>()

const databaseForm = defineModel<DatabaseConfigForm>('databaseForm', { required: true })
const { t } = useI18n()
</script>

<template>
  <section class="mt-8">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-bold text-light-text dark:text-dark-text">
        <Icon name="upload" class="h-5 w-5 text-blue-500" />
        {{ t('admin.uploadLimit', 'Upload Limits') }}
      </h2>
      <button class="btn-secondary flex items-center gap-1.5 text-sm" @click="$emit('openUploadLimit')">
        <Icon name="pen" class="h-4 w-4" />
        {{ t('admin.editUploadLimit', 'Edit System Settings') }}
      </button>
    </div>

    <div class="card space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-sm" style="color: var(--text-secondary-color)">{{ t('admin.uploadLimitMb', 'Single file upload size limit (MB)') }}{{ t('common.colon', ': ') }}</span>
        <span class="text-lg font-semibold" style="color: var(--text-color)">{{ uploadLimit }} MB</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm" style="color: var(--text-secondary-color)">{{ t('admin.maxConcurrentUploads', 'Max concurrent uploads') }}{{ t('common.colon', ': ') }}</span>
        <span class="text-lg font-semibold" style="color: var(--text-color)">{{ maxConcurrentUploads }}</span>
      </div>
    </div>

    <div class="mb-4 mt-8 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-bold text-light-text dark:text-dark-text">
        <Icon name="database" class="h-5 w-5 text-cyan-500" />
        {{ t('admin.database', 'Database Configuration') }}
      </h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary flex items-center gap-1.5 text-sm" :disabled="databaseTesting" @click="$emit('testDatabase')">
          <Icon name="check" class="h-4 w-4" />
          {{ databaseTesting ? t('admin.testing', 'Testing...') : t('admin.testConnection', 'Test Connection') }}
        </button>
        <button class="btn-primary flex items-center gap-1.5 text-sm" :disabled="databaseSaving" @click="$emit('saveDatabase')">
          <Icon name="save" class="h-4 w-4" />
          {{ databaseSaving ? t('admin.saving', 'Saving...') : t('admin.saveConfig', 'Save Config') }}
        </button>
      </div>
    </div>

    <div class="card mb-8 space-y-4">
      <div
        v-if="databaseMessage"
        class="rounded-lg border px-3 py-2 text-sm"
        :class="databaseMessageType === 'success'
          ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
          : databaseMessageType === 'error'
            ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
            : 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400'"
      >
        {{ databaseMessage }}
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.databaseType', 'Database Type') }}</label>
          <select v-model="databaseForm.type" class="input-field">
            <option value="sqlite">SQLite</option>
            <option value="mysql">MySQL</option>
            <option value="postgres">PostgreSQL</option>
          </select>
        </div>

        <div class="rounded-lg border px-3 py-3 text-sm" style="border-color: var(--border-color); background-color: var(--surface-color)">
          <div class="mb-1 font-medium" style="color: var(--text-color)">{{ t('admin.runtimeStatus', 'Runtime Status') }}</div>
          <div style="color: var(--text-secondary-color)">{{ databaseStatus?.message || t('admin.unavailable', 'Status unavailable') }}</div>
          <div v-if="databaseStatus?.note" class="mt-2 text-xs" style="color: var(--text-secondary-color)">
            {{ databaseStatus.note }}
          </div>
        </div>
      </div>

      <div v-if="databaseForm.type === 'sqlite'">
        <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.sqlitePath', 'SQLite File Path') }}</label>
        <input v-model="databaseForm.sqlite.path" type="text" class="input-field" placeholder="./data/filemanager.db" />
      </div>

      <div v-if="databaseForm.type === 'mysql'" class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.host', 'Host') }}</label>
          <input v-model="databaseForm.mysql.host" type="text" class="input-field" placeholder="127.0.0.1" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.port', 'Port') }}</label>
          <input v-model.number="databaseForm.mysql.port" type="number" class="input-field" placeholder="3306" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.username', 'Username') }}</label>
          <input v-model="databaseForm.mysql.user" type="text" class="input-field" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.password', 'Password') }}</label>
          <input v-model="databaseForm.mysql.password" type="password" class="input-field" />
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.database', 'Database') }}</label>
          <input v-model="databaseForm.mysql.database" type="text" class="input-field" />
        </div>
        <label class="flex items-center gap-2 text-sm" style="color: var(--text-color)">
          <input v-model="databaseForm.mysql.ssl" type="checkbox" />
          {{ t('admin.ssl', 'Enable SSL') }}
        </label>
      </div>

      <div v-if="databaseForm.type === 'postgres'" class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.host', 'Host') }}</label>
          <input v-model="databaseForm.postgres.host" type="text" class="input-field" placeholder="127.0.0.1" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.port', 'Port') }}</label>
          <input v-model.number="databaseForm.postgres.port" type="number" class="input-field" placeholder="5432" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.username', 'Username') }}</label>
          <input v-model="databaseForm.postgres.user" type="text" class="input-field" />
        </div>
        <div>
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.password', 'Password') }}</label>
          <input v-model="databaseForm.postgres.password" type="password" class="input-field" />
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.database', 'Database') }}</label>
          <input v-model="databaseForm.postgres.database" type="text" class="input-field" />
        </div>
        <label class="flex items-center gap-2 text-sm" style="color: var(--text-color)">
          <input v-model="databaseForm.postgres.ssl" type="checkbox" />
          {{ t('admin.ssl', 'Enable SSL') }}
        </label>
      </div>
    </div>
  </section>
</template>
