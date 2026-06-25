<script setup lang="ts">
import { reactive } from 'vue'
import FileList from '@/components/FileList.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import UploadProgressPanel from '@/components/UploadProgressPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilePreview from '@/components/FilePreview.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import SpotlightSearch from '@/components/SpotlightSearch.vue'
import GuestShareDialog from '@/components/GuestShareDialog.vue'
import ShareMountDialog from '@/components/ShareMountDialog.vue'
import Toast from '@/components/Toast.vue'
import MoveDialog from '@/components/MoveDialog.vue'
import Icon from '@/components/Icon.vue'
import DirectoryReadme from '@/components/DirectoryReadme.vue'
import OfflineTasksPanel from '@/components/OfflineTasksPanel.vue'
import { useHomeView } from '@/composables/useHomeView'
import { useI18n } from '@/composables/useI18n'

const state = reactive(useHomeView())
const { t } = useI18n()
</script>

<template>
  <div
    class="flex"
    @dragenter="state.handleDragEnter"
    @dragleave="state.handleDragLeave"
    @dragover="state.handleDragOver"
    @drop="state.handleDrop"
  >
    <div
      v-if="state.isDragging"
      class="fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-blue-500 bg-blue-500/20"
      @dragenter="state.handleDragEnter"
      @dragleave="state.handleDragLeave"
      @dragover="state.handleDragOver"
      @drop="state.handleDrop"
    >
      <div class="rounded-xl border bg-white p-8 text-center dark:bg-dark-card">
        <Icon name="upload" class="mb-3 h-16 w-16" style="color: var(--accent-color)" />
        <p class="text-lg font-semibold" style="color: var(--text-color)">{{ t('upload.dropOverlay', 'Drop files here to upload') }}</p>
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <div class="px-4 pt-4">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-1.5 text-sm">
            <div class="pool-dropdown-trigger relative">
              <button
                class="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                :style="{ color: state.currentPoolId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: state.currentPoolId ? 'normal' : '500' }"
                @click.stop="state.showPoolDropdown = !state.showPoolDropdown"
              >
                <Icon name="server" class="h-4 w-4" />
                <span>{{ state.currentPoolId ? state.currentPoolName : t('file.allPools', 'All Storage Pools') }}</span>
                <Icon name="chevron-down" class="h-3 w-3" />
              </button>

              <div
                v-if="state.showPoolDropdown"
                class="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border py-1 shadow-sm"
                style="background-color: var(--card-color); border-color: var(--border-color)"
              >
                <button
                  class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: !state.currentPoolId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: !state.currentPoolId ? '500' : 'normal' }"
                  @click="state.goBackToPools(); state.showPoolDropdown = false"
                >
                  <Icon name="server" class="h-4 w-4" />
                  {{ t('file.allPools', 'All Storage Pools') }}
                </button>
                <div
                  v-for="pool in state.pools"
                  :key="pool.id"
                  class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: state.currentPoolId === pool.id ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: state.currentPoolId === pool.id ? '500' : 'normal' }"
                  @click="state.navigateToPath('', pool.id); state.showPoolDropdown = false"
                >
                  <Icon name="folder" class="h-4 w-4" />
                  {{ pool.name }}
                </div>
              </div>
            </div>

            <template v-if="state.currentPoolId && state.pathSegments.length > 0">
              <template v-for="(segment, index) in state.pathSegments" :key="index">
                <Icon name="chevron-right" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                <button
                  class="rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: index === state.pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === state.pathSegments.length - 1 ? '500' : 'normal' }"
                  @click="state.navigateToPath(state.pathSegments.slice(0, index + 1).join('/'), state.currentPoolId)"
                >
                  {{ segment }}
                </button>
              </template>
            </template>
          </div>

          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button class="btn-secondary flex items-center gap-1 text-sm" :title="t('search.shortcutHint', 'Ctrl+K Search')" @click="state.triggerSpotlight">
              <Icon name="search" class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('common.search', 'Search') }}</span>
            </button>

            <button class="btn-secondary flex items-center gap-1 text-sm" :title="t('common.refresh', 'Refresh')" @click="state.filesStore.fetchFiles(state.currentPath, state.currentPoolId)">
              <Icon name="refresh-cw" class="h-4 w-4" />
            </button>

            <button v-if="state.currentPath || state.currentPoolId" class="btn-secondary flex items-center gap-1 text-sm" @click="state.goUp">
              <Icon name="arrow-up" class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('file.goUp', 'Up') }}</span>
            </button>

            <div class="view-mode-toggle flex items-center overflow-hidden rounded-lg border" style="border-color: var(--border-color)">
              <button class="p-1.5 transition-colors" :class="state.viewMode === 'list' ? 'view-mode-active' : ''" :title="t('file.listView', 'List View')" @click="state.viewMode = 'list'">
                <Icon name="list" class="h-4 w-4" />
              </button>
              <button class="p-1.5 transition-colors" :class="state.viewMode === 'medium-list' ? 'view-mode-active' : ''" :title="t('file.mediumListView', 'Medium List View')" @click="state.viewMode = 'medium-list'">
                <Icon name="video" class="h-4 w-4" />
              </button>
              <button class="p-1.5 transition-colors" :class="state.viewMode === 'grid' ? 'view-mode-active' : ''" :title="t('file.gridView', 'Grid View')" @click="state.viewMode = 'grid'">
                <Icon name="grid" class="h-4 w-4" />
              </button>
            </div>

            <div class="toolbar-select-group">
              <span class="toolbar-select-label hidden sm:inline">
                {{ t('file.sortShort', 'Sort') }}
              </span>
              <div class="relative flex min-w-[5.5rem] items-center">
                <select
                  class="toolbar-select-native"
                  :value="state.sortKey"
                  :title="t('file.sortShort', 'Sort')"
                  @change="state.updateSort(($event.target as HTMLSelectElement).value as any)"
                >
                  <option value="name">{{ t('file.sortField.name', 'Name') }}</option>
                  <option value="modified">{{ t('file.sortField.modified', 'Modified') }}</option>
                  <option value="type">{{ t('file.sortField.type', 'Type') }}</option>
                  <option value="size">{{ t('file.sortField.size', 'Size') }}</option>
                </select>
                <Icon name="chevron-down" class="toolbar-select-caret pointer-events-none absolute right-0 h-4 w-4" />
              </div>
              <span class="toolbar-select-divider" />
              <button
                class="toolbar-select-action"
                :title="t(`file.sortDirection.${state.sortDirection}`, state.sortDirection)"
                @click="state.updateSort(state.sortKey)"
              >
                <Icon :name="state.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'" class="h-4 w-4" />
              </button>
            </div>

            <button class="btn-secondary flex items-center gap-1 text-sm" @click="state.showCreateFolder = true">
              <Icon name="folder-plus" class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('file.newFolderShort', 'New') }}</span>
            </button>

            <button
              v-if="state.canUseRemoteUpload"
              class="btn-secondary flex items-center gap-1 text-sm"
              :title="t('file.remoteUploadTitle', 'Remote URL Upload')"
              @click="state.showRemoteUpload = true"
            >
              <Icon name="network-wired" class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('file.remoteUpload', 'Remote Upload') }}</span>
            </button>

            <button class="btn-primary flex items-center gap-1 text-sm" @click="state.showUpload = true">
              <Icon name="upload" class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('upload.shortTitle', 'Upload') }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="state.isSelectMode"
          class="mb-3 flex flex-col gap-2 rounded-lg p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)"
        >
          <div class="flex min-w-0 items-center gap-2 sm:gap-3">
            <button class="flex-shrink-0 text-sm hover:underline" style="color: var(--accent-color)" @click="state.selectAll">
              {{
                state.selectedFiles.size === (state.showSearch ? state.searchResults : state.filesStore.files).length
                  ? t('file.unselectAll', 'Unselect All')
                  : t('file.selectAll', 'Select All')
              }}
            </button>
            <span class="truncate" style="color: var(--text-secondary-color)">
              {{ t('file.selectedItems', '{count} items selected').replace('{count}', String(state.selectedFiles.size)) }}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-secondary px-3 py-1 text-xs" @click="state.handleBatchDownload">
              {{ t('file.batchDirectDownload', 'Batch Download') }}
            </button>
            <button class="btn-secondary px-3 py-1 text-xs" @click="state.handleBatchZipDownload">
              {{ t('file.batchZipDownload', 'Download as ZIP') }}
            </button>
            <button class="ml-1 flex-shrink-0 text-sm hover:underline" style="color: var(--text-secondary-color)" @click="state.clearSelection">
              {{ t('common.cancel', 'Cancel') }}
            </button>
          </div>
        </div>

        <div
          v-if="state.clipboardFiles.length > 0 && !state.isSelectMode"
          class="mb-3 rounded-lg border p-2 text-sm"
          style="background-color: var(--hover-color); border-color: var(--border-color)"
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span class="truncate" style="color: var(--text-secondary-color)">
              {{ (state.clipboardMode === 'copy' ? t('file.copy', 'Copy') : t('file.move', 'Move')) + ' ' + state.clipboardFiles.length + ' ' + t('file.items', 'items') }}
            </span>
            <div class="flex flex-shrink-0 items-center gap-2">
              <button class="btn-primary px-3 py-1 text-xs" @click="state.handlePaste">{{ t('file.paste', 'Paste') }}</button>
              <button class="btn-secondary px-3 py-1 text-xs" @click="state.clipboardFiles = []">{{ t('file.clear', 'Clear') }}</button>
            </div>
          </div>
        </div>

        <div v-if="state.showSearch" class="mb-4">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-medium" style="color: var(--text-color)">
              {{ t('search.resultsCount', 'Search results: {count} items').replace('{count}', String(state.sortedSearchResults.length)) }}
            </h3>
            <button class="text-xs hover:underline" style="color: var(--accent-color)" @click="state.showSearch = false; state.searchQuery = ''">
              {{ t('file.clear', 'Clear') }}
            </button>
          </div>
        </div>

        <DirectoryReadme
          v-if="!state.showSearch && state.filesStore.readme"
          :src="state.filesStore.readme.directUrl || state.filesStore.readme.fileUrl"
          :title="state.filesStore.readme.name"
        />

        <div v-if="state.offlineTasks.length > 0 && state.offlineTasksHidden" class="mb-4 flex justify-end">
          <button class="btn-secondary px-3 py-1 text-xs" @click="state.showOfflineTasksPanel()">{{ t('offline.showPanel', 'Show Offline Tasks') }}</button>
        </div>

        <OfflineTasksPanel
          v-if="state.offlineTasks.length > 0 && !state.offlineTasksHidden"
          class="mb-4"
          :tasks="state.offlineTasks"
          :loading="state.offlineTasksLoading"
          :show-hide-button="true"
          :can-clear-finished="state.hasFinishedOfflineTasks"
          @refresh="state.loadOfflineTasks"
          @cancel="state.cancelOfflineTask"
          @retry="state.retryOfflineTask"
          @clear-finished="state.clearFinishedOfflineTasks"
          @hide="state.hideOfflineTasksPanel"
        />

        <FileList
          :files="state.showSearch ? state.sortedSearchResults : state.sortedFiles"
          :loading="state.filesStore.loading || state.isSearching"
          :show-actions="true"
          :select-mode="!!state.currentPoolId"
          :selected-files="state.selectedFiles"
          :view-mode="state.viewMode"
          :current-pool-id="state.currentPoolId"
          :sort-key="state.sortKey"
          :sort-direction="state.sortDirection"
          @open="state.openFile"
          @download="state.handleDownload"
          @delete="state.confirmDelete"
          @contextmenu="state.handleContextMenu"
          @toggle-select="state.toggleSelectFile"
          @detail="state.showDetail"
          @sort="state.updateSort"
        />

        <div v-if="state.filesStore.error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {{ state.filesStore.error }}
        </div>
      </div>
    </div>
  </div>

  <ContextMenu
    :visible="state.contextMenu.visible"
    :x="state.contextMenu.x"
    :y="state.contextMenu.y"
    :item="state.contextMenu.item"
    :selected-items="state.isSelectMode ? Array.from(state.selectedFiles) : []"
    :clipboard-count="state.clipboardFiles.length"
    :show-remote-upload-action="state.canUseRemoteUpload"
    @close="state.contextMenu.visible = false"
    @action="state.handleContextAction"
  />

  <FileDetailPanel :visible="state.showDetailPanel" :item="state.detailItem" @close="state.showDetailPanel = false" @favourite="state.toggleFavourite" />
  <SpotlightSearch :current-path="state.currentPath" :current-pool-id="state.currentPoolId" @navigate="state.handleSpotlightNavigate" />

  <UploadDialog
    :show="state.showUpload"
    :current-path="state.currentPath"
    :pools="state.pools"
    :current-pool-id="state.currentPoolId"
    :pending-files="state.pendingUploadFiles"
    :uploading="state.isUploadBusy"
    :upload-progress="state.uploadProgress"
    :upload-status="state.uploadStatus"
    :upload-error="state.uploadError"
    @close="state.showUpload = false"
    @upload="state.handleUpload"
    @cancel="state.cancelUploads"
  />

  <Teleport to="body">
    <div v-if="state.showRemoteUpload" class="dialog-overlay">
      <div class="dialog-backdrop" @click="state.showRemoteUpload = false" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-md">
        <div class="dialog-section">
        <h3 class="dialog-title mb-4">{{ t('file.remoteUploadTitle', 'Remote URL Upload') }}</h3>
        <textarea
          v-model="state.remoteUrl"
          class="input-field mb-2 min-h-[120px] resize-y"
          :placeholder="t('file.remoteUploadPlaceholder', 'https://example.com/file-a.zip, https://example.com/file-b.zip')"
          spellcheck="false"
        />
        <p class="dialog-form-help mb-4 mt-0">
          {{ t('file.remoteUploadUrlHint', 'Enter one or more remote URLs separated by commas.') }}
        </p>
        <div class="mb-4">
          <label class="dialog-form-label">{{ t('file.remoteUploadMode', 'Upload Mode') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="dialog-choice-card"
              :class="state.remoteUploadMode === 'instant' ? 'dialog-choice-card-active' : ''"
              @click="state.remoteUploadMode = 'instant'"
            >
              {{ t('file.remoteUploadInstant', 'Upload Now') }}
            </button>
            <button
              class="dialog-choice-card"
              :class="state.remoteUploadMode === 'offline' ? 'dialog-choice-card-active' : ''"
              @click="state.remoteUploadMode = 'offline'"
            >
              {{ t('file.remoteUploadOffline', 'Offline Download') }}
            </button>
          </div>
          <p class="dialog-form-help">
            {{
              state.remoteUploadMode === 'offline'
                ? t('file.remoteUploadOfflineHint', 'The server will download in the background and write into the current directory.')
                : t('file.remoteUploadInstantHint', 'The server will request the remote resource and write it to storage immediately.')
            }}
          </p>
        </div>
        <div class="dialog-footer mt-0">
          <button class="btn-secondary text-sm" @click="state.showRemoteUpload = false">{{ t('common.cancel', 'Cancel') }}</button>
          <button class="btn-primary text-sm" :disabled="state.remoteUploading" @click="state.handleRemoteUpload">
            {{ state.remoteUploading ? t('upload.uploading', 'Uploading...') : t('upload.start', 'Start Upload') }}
          </button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="state.showCreateFolder" class="dialog-overlay">
      <div class="dialog-backdrop" @click="state.showCreateFolder = false" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-sm">
        <div class="dialog-section">
        <h3 class="dialog-title mb-4">{{ t('file.newFolder', 'New Folder') }}</h3>
        <input v-model="state.newFolderName" type="text" class="input-field mb-4" :placeholder="t('file.newFolderPlaceholder', 'Folder name')" @keyup.enter="state.handleCreateFolder" />
        <div class="dialog-footer mt-0">
          <button class="btn-secondary text-sm" @click="state.showCreateFolder = false">{{ t('common.cancel', 'Cancel') }}</button>
          <button class="btn-primary text-sm" @click="state.handleCreateFolder">{{ t('common.create', 'Create') }}</button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="state.showRename" class="dialog-overlay">
      <div class="dialog-backdrop" @click="state.showRename = false" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-sm">
        <div class="dialog-section">
        <h3 class="dialog-title mb-4">{{ t('file.rename', 'Rename') }}</h3>
        <input v-model="state.newFileName" type="text" class="input-field mb-4" :placeholder="t('file.renamePlaceholder', 'New name')" @keyup.enter="state.handleRename" />
        <div class="dialog-footer mt-0">
          <button class="btn-secondary text-sm" @click="state.showRename = false">{{ t('common.cancel', 'Cancel') }}</button>
          <button class="btn-primary text-sm" @click="state.handleRename">{{ t('common.confirm', 'Confirm') }}</button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>

  <ConfirmDialog
    :show="state.showDeleteConfirm"
    :title="t('file.confirmDeleteTitle', 'Confirm Delete')"
    :message="t('file.confirmDeleteMessage', 'Delete {name}?').replace('{name}', state.fileToDelete?.name || '')"
    :confirm-text="t('common.delete', 'Delete')"
    :danger="true"
    @confirm="state.handleDelete"
    @cancel="state.showDeleteConfirm = false"
  />

  <FilePreview
    v-if="state.fileToPreview"
    :show="state.showPreview"
    :file-path="state.fileToPreview.path"
    :file-name="state.fileToPreview.name"
    :file-url="state.fileToPreview.directUrl || state.fileToPreview.fileUrl"
    :pool-id="state.fileToPreview.poolId || state.currentPoolId"
    :file-list="state.filesStore.files"
    @close="state.showPreview = false; state.fileToPreview = null"
  />

  <ShareDialog
    v-if="state.fileToShare"
    :show="state.showShare"
    :file-path="state.fileToShare.path"
    :file-name="state.fileToShare.name"
    :pool-id="state.fileToShare.poolId || state.currentPoolId"
    :file-type="state.fileToShare.type"
    @close="state.showShare = false"
  />

  <GuestShareDialog
    v-if="state.fileToGuestShare"
    :show="state.showGuestShare"
    :folder-path="state.fileToGuestShare.path"
    :folder-name="state.fileToGuestShare.name"
    :pool-id="state.fileToGuestShare.poolId || state.currentPoolId"
    @close="state.showGuestShare = false"
    @done="state.filesStore.fetchFiles(state.currentPath, state.currentPoolId)"
  />

  <ShareMountDialog
    :show="state.showShareMount"
    :items="state.filesToShareMount"
    @close="state.showShareMount = false"
    @done="state.showToast(t('shareMount.success', 'Cross-pool mount created'), 'success')"
  />

  <MoveDialog
    :show="state.showMoveDialog"
    :pools="state.pools"
    :current-pool-id="state.currentPoolId"
    :current-path="state.currentPath"
    @close="state.showMoveDialog = false"
    @confirm="state.handleMoveConfirm"
  />

  <Toast :show="state.toast.show" :message="state.toast.message" :type="state.toast.type" @close="state.toast.show = false" />

  <UploadProgressPanel
    :show="state.showUploadProgress"
    :collapsed="state.uploadPanelCollapsed"
    :upload-status="state.uploadStatus"
    :upload-status-label="state.uploadStatusLabel"
    :upload-progress="state.uploadProgress"
    :upload-summary="state.uploadSummary"
    :upload-active-count="state.uploadActiveCount"
    @close="state.showUploadProgress = false"
    @toggle="state.toggleUploadPanelCollapsed"
    @cancel="state.cancelUploads"
  />

  <Teleport to="body">
    <div v-if="state.showAplayer" class="aplayer-float" :class="{ 'aplayer-mobile': state.isMobileDevice }">
      <div
        v-if="state.aplayerCollapsed"
        class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full shadow-sm transition-all active:scale-95"
        style="background-color: var(--accent-color); color: white"
        :title="t('player.expand', 'Expand Player')"
        @click="state.toggleAplayerCollapse"
      >
        <Icon name="music" class="h-4 w-4" />
      </div>
      <div v-show="!state.aplayerCollapsed" class="aplayer-wrap overflow-hidden rounded-lg border" style="background-color: var(--card-color); border-color: var(--border-color)">
        <div class="flex items-center justify-between border-b px-2 py-1" style="background-color: var(--surface-color); border-bottom-color: var(--border-color)">
          <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('player.title', 'Player') }}</span>
          <div class="flex items-center gap-0.5">
            <button class="rounded p-1 hover:opacity-80" :title="t('player.collapse', 'Collapse')" style="color: var(--text-secondary-color)" @click="state.toggleAplayerCollapse">
              <Icon name="chevron-down" class="h-3.5 w-3.5" />
            </button>
            <button class="rounded p-1 hover:opacity-80" :title="t('common.close', 'Close')" style="color: var(--text-secondary-color)" @click="state.destroyAplayer">
              <Icon name="xmark" class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div :ref="state.setAplayerRef" />
      </div>
    </div>
  </Teleport>
</template>
