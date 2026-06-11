<script setup lang="ts">
import { reactive } from 'vue'
import FileList from '@/components/FileList.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilePreview from '@/components/FilePreview.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import SpotlightSearch from '@/components/SpotlightSearch.vue'
import GuestShareDialog from '@/components/GuestShareDialog.vue'
import Toast from '@/components/Toast.vue'
import MoveDialog from '@/components/MoveDialog.vue'
import Icon from '@/components/Icon.vue'
import DirectoryReadme from '@/components/DirectoryReadme.vue'
import OfflineTasksPanel from '@/components/OfflineTasksPanel.vue'
import { useHomeView } from '@/composables/useHomeView'

const state = reactive(useHomeView())
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
      class="fixed inset-0 z-40 bg-blue-500/20 border-4 border-dashed border-blue-500 flex items-center justify-center"
      @dragenter="state.handleDragEnter"
      @dragleave="state.handleDragLeave"
      @dragover="state.handleDragOver"
      @drop="state.handleDrop"
    >
      <div class="bg-white dark:bg-dark-card rounded-xl p-8 border text-center">
        <Icon name="upload" class="w-16 h-16 mb-3" style="color: var(--accent-color)" />
        <p class="text-lg font-semibold" style="color: var(--text-color)">拖放文件到此处上传</p>
      </div>
    </div>

    <div class="flex-1 min-w-0">
      <div class="px-4 pt-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div class="flex items-center gap-1.5 text-sm flex-wrap">
            <div class="relative pool-dropdown-trigger">
              <button
                class="flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                :style="{ color: state.currentPoolId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: state.currentPoolId ? 'normal' : '500' }"
                @click.stop="state.showPoolDropdown = !state.showPoolDropdown"
              >
                <Icon name="server" class="w-4 h-4" />
                <span>{{ state.currentPoolId ? state.currentPoolName : '全部存储池' }}</span>
                <Icon name="chevron-down" class="w-3 h-3" />
              </button>

              <div
                v-if="state.showPoolDropdown"
                class="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border py-1 shadow-sm"
                style="background-color: var(--card-color); border-color: var(--border-color)"
              >
                <button
                  class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: !state.currentPoolId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: !state.currentPoolId ? '500' : 'normal' }"
                  @click="state.goBackToPools(); state.showPoolDropdown = false"
                >
                  <Icon name="server" class="w-4 h-4" />
                  全部存储池
                </button>
                <div
                  v-for="pool in state.pools"
                  :key="pool.id"
                  class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: state.currentPoolId === pool.id ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: state.currentPoolId === pool.id ? '500' : 'normal' }"
                  @click="state.navigateToPath('', pool.id); state.showPoolDropdown = false"
                >
                  <Icon name="folder" class="w-4 h-4" />
                  {{ pool.name }}
                </div>
              </div>
            </div>

            <template v-if="state.currentPoolId && state.pathSegments.length > 0">
              <template v-for="(segment, index) in state.pathSegments" :key="index">
                <Icon name="chevron-right" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                <button
                  class="px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: index === state.pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === state.pathSegments.length - 1 ? '500' : 'normal' }"
                  @click="state.navigateToPath(state.pathSegments.slice(0, index + 1).join('/'), state.currentPoolId)"
                >
                  {{ segment }}
                </button>
              </template>
            </template>
          </div>

          <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button class="btn-secondary text-sm flex items-center gap-1" title="Ctrl+K 搜索" @click="state.triggerSpotlight">
              <Icon name="search" class="w-4 h-4" />
              <span class="hidden sm:inline">搜索</span>
            </button>

            <button class="btn-secondary text-sm flex items-center gap-1" title="刷新" @click="state.filesStore.fetchFiles(state.currentPath, state.currentPoolId)">
              <Icon name="refresh-cw" class="w-4 h-4" />
            </button>

            <button v-if="state.currentPath || state.currentPoolId" class="btn-secondary text-sm flex items-center gap-1" @click="state.goUp">
              <Icon name="arrow-up" class="w-4 h-4" />
              <span class="hidden sm:inline">上级</span>
            </button>

            <div class="view-mode-toggle flex items-center border rounded-lg overflow-hidden" style="border-color: var(--border-color)">
              <button class="p-1.5 transition-colors" :class="state.viewMode === 'list' ? 'view-mode-active' : ''" title="列表模式" @click="state.viewMode = 'list'">
                <Icon name="list" class="w-4 h-4" />
              </button>
              <button class="p-1.5 transition-colors" :class="state.viewMode === 'grid' ? 'view-mode-active' : ''" title="图片模式" @click="state.viewMode = 'grid'">
                <Icon name="grid" class="w-4 h-4" />
              </button>
            </div>

            <button class="btn-secondary text-sm flex items-center gap-1" @click="state.showCreateFolder = true">
              <Icon name="folder-plus" class="w-4 h-4" />
              <span class="hidden sm:inline">新建</span>
            </button>

            <button
              v-if="state.canUseRemoteUpload"
              class="btn-secondary text-sm flex items-center gap-1"
              title="远程URL上传"
              @click="state.showRemoteUpload = true"
            >
              <Icon name="network-wired" class="w-4 h-4" />
              <span class="hidden sm:inline">远程上传</span>
            </button>

            <button class="btn-primary text-sm flex items-center gap-1" @click="state.showUpload = true">
              <Icon name="upload" class="w-4 h-4" />
              <span class="hidden sm:inline">上传</span>
            </button>
          </div>
        </div>

        <div
          v-if="state.isSelectMode"
          class="mb-3 p-2 rounded-lg flex items-center justify-between text-sm"
          style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)"
        >
          <div class="flex items-center gap-2 sm:gap-3 min-w-0">
            <button class="text-sm hover:underline flex-shrink-0" style="color: var(--accent-color)" @click="state.selectAll">
              {{ state.selectedFiles.size === (state.showSearch ? state.searchResults : state.filesStore.files).length ? '取消全选' : '全选' }}
            </button>
            <span class="truncate" style="color: var(--text-secondary-color)">已选 {{ state.selectedFiles.size }} 项</span>
          </div>
          <button class="text-sm hover:underline flex-shrink-0 ml-2" style="color: var(--text-secondary-color)" @click="state.clearSelection">
            取消
          </button>
        </div>

        <div
          v-if="state.clipboardFiles.length > 0 && !state.isSelectMode"
          class="mb-3 p-2 rounded-lg border text-sm"
          style="background-color: var(--hover-color); border-color: var(--border-color)"
        >
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span class="truncate" style="color: var(--text-secondary-color)">
              {{ state.clipboardMode === 'copy' ? '复制' : '移动' }} {{ state.clipboardFiles.length }} 项
            </span>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button class="btn-primary text-xs px-3 py-1" @click="state.handlePaste">粘贴</button>
              <button class="btn-secondary text-xs px-3 py-1" @click="state.clipboardFiles = []">清空</button>
            </div>
          </div>
        </div>

        <div v-if="state.showSearch" class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium" style="color: var(--text-color)">搜索结果：{{ state.searchResults.length }} 个</h3>
            <button class="text-xs hover:underline" style="color: var(--accent-color)" @click="state.showSearch = false; state.searchQuery = ''">清除</button>
          </div>
        </div>

        <DirectoryReadme
          v-if="!state.showSearch && state.filesStore.readme"
          :src="state.filesStore.readme.directUrl || state.filesStore.readme.fileUrl"
          :title="state.filesStore.readme.name"
        />

        <div
          v-if="state.offlineTasks.length > 0 && state.offlineTasksHidden"
          class="mb-4 flex justify-end"
        >
          <button class="btn-secondary text-xs px-3 py-1" @click="state.showOfflineTasksPanel()">
            显示离线任务
          </button>
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
          :files="state.showSearch ? state.searchResults : state.filesStore.files"
          :loading="state.filesStore.loading || state.isSearching"
          :show-actions="true"
          :select-mode="!!state.currentPoolId"
          :selected-files="state.selectedFiles"
          :view-mode="state.viewMode"
          :current-pool-id="state.currentPoolId"
          @open="state.openFile"
          @download="state.handleDownload"
          @delete="state.confirmDelete"
          @contextmenu="state.handleContextMenu"
          @toggle-select="state.toggleSelectFile"
          @detail="state.showDetail"
        />

        <div v-if="state.filesStore.error" class="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
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
  <SpotlightSearch @navigate="state.handleSpotlightNavigate" />

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
    @close="state.showUpload = false; state.pendingUploadFiles = []; state.uploadError = ''; state.uploadStatus = ''; state.showUploadProgress = false"
    @upload="state.handleUpload"
    @cancel="state.cancelUploads"
  />

  <Teleport to="body">
    <div v-if="state.showRemoteUpload" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showRemoteUpload = false"/>
      <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">远程URL上传</h3>
        <input v-model="state.remoteUrl" type="url" class="input-field mb-4" placeholder="https://example.com/file.zip" />
        <div class="mb-4">
          <label class="block text-sm mb-1.5" style="color: var(--text-secondary-color)">上传方式</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="rounded-lg border px-3 py-2 text-sm transition-colors"
              :style="state.remoteUploadMode === 'instant'
                ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color); color: var(--accent-color)'
                : 'border-color: var(--border-color); color: var(--text-color)'"
              @click="state.remoteUploadMode = 'instant'"
            >
              立即上传
            </button>
            <button
              class="rounded-lg border px-3 py-2 text-sm transition-colors"
              :style="state.remoteUploadMode === 'offline'
                ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color); color: var(--accent-color)'
                : 'border-color: var(--border-color); color: var(--text-color)'"
              @click="state.remoteUploadMode = 'offline'"
            >
              离线下载
            </button>
          </div>
          <p class="mt-2 text-xs" style="color: var(--text-secondary-color)">
            {{ state.remoteUploadMode === 'offline' ? '服务器会在后台下载并写入当前目录。' : '当前会直接请求远程资源并立即写入存储池。' }}
          </p>
        </div>
        <div class="flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="state.showRemoteUpload = false">取消</button>
          <button class="btn-primary text-sm" :disabled="state.remoteUploading" @click="state.handleRemoteUpload">
            {{ state.remoteUploading ? '上传中...' : '开始上传' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="state.showCreateFolder" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showCreateFolder = false"/>
      <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">新建文件夹</h3>
        <input v-model="state.newFolderName" type="text" class="input-field mb-4" placeholder="文件夹名称" @keyup.enter="state.handleCreateFolder" />
        <div class="flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="state.showCreateFolder = false">取消</button>
          <button class="btn-primary text-sm" @click="state.handleCreateFolder">创建</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="state.showRename" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showRename = false"/>
      <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">重命名</h3>
        <input v-model="state.newFileName" type="text" class="input-field mb-4" placeholder="新名称" @keyup.enter="state.handleRename" />
        <div class="flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="state.showRename = false">取消</button>
          <button class="btn-primary text-sm" @click="state.handleRename">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <ConfirmDialog
    :show="state.showDeleteConfirm"
    title="确认删除"
    :message="`确定要删除「${state.fileToDelete?.name}」吗？`"
    confirm-text="删除"
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

  <MoveDialog
    :show="state.showMoveDialog"
    :pools="state.pools"
    :current-pool-id="state.currentPoolId"
    :current-path="state.currentPath"
    @close="state.showMoveDialog = false"
    @confirm="state.handleMoveConfirm"
  />

  <Toast :show="state.toast.show" :message="state.toast.message" :type="state.toast.type" @close="state.toast.show = false" />

  <Teleport to="body">
    <div
      v-if="state.showUploadProgress"
      class="fixed right-4 bottom-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border shadow-sm"
      style="background-color: var(--card-color); border-color: var(--border-color)"
    >
      <div
        class="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style="border-color: var(--border-color); background-color: var(--surface-color)"
      >
        <h4 class="text-sm font-semibold" style="color: var(--text-color)">
          上传进度
          <span v-if="state.uploadStatusLabel" class="ml-2 text-xs" :class="state.uploadStatus === 'cancelled' ? 'text-red-500' : 'text-amber-500'">
            {{ state.uploadStatusLabel }}
          </span>
        </h4>
        <button v-if="state.uploadStatus === 'uploading'" class="btn-secondary text-xs px-3 py-1" @click="state.cancelUploads">
          取消上传
        </button>
        <button
          v-else
          class="p-1 rounded transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
          style="color: var(--text-secondary-color)"
          @click="state.showUploadProgress = false"
        >
          <Icon name="xmark" class="w-4 h-4" />
        </button>
      </div>
      <div class="p-4 max-h-[40vh] overflow-y-auto">
        <div v-for="(item, index) in state.uploadProgress" :key="index" class="mb-3 last:mb-0">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="truncate max-w-[220px]" style="color: var(--text-color)">{{ item.file }}</span>
            <span class="flex-shrink-0 ml-2" style="color: var(--text-secondary-color)">
              {{ state.uploadStatus === 'processing' && item.percent >= 100 ? '处理中' : `${item.percent}%` }}
            </span>
          </div>
          <div class="w-full rounded-full h-2" style="background-color: var(--hover-color)">
            <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" :style="{ width: item.percent + '%' }"></div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="state.showAplayer" class="aplayer-float" :class="{ 'aplayer-mobile': state.isMobileDevice }">
      <div
        v-if="state.aplayerCollapsed"
        class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm transition-all active:scale-95"
        style="background-color: var(--accent-color); color: white"
        title="展开播放器"
        @click="state.toggleAplayerCollapse"
      >
        <Icon name="music" class="w-4 h-4" />
      </div>
      <div v-show="!state.aplayerCollapsed" class="aplayer-wrap rounded-lg overflow-hidden border" style="background-color: var(--card-color); border-color: var(--border-color)">
        <div class="flex items-center justify-between px-2 py-1" style="background-color: var(--surface-color); border-bottom: 1px solid var(--border-color)">
          <span class="text-xs" style="color: var(--text-secondary-color)">播放器</span>
          <div class="flex items-center gap-0.5">
            <button class="p-1 rounded hover:opacity-80" title="收缩" style="color: var(--text-secondary-color)" @click="state.toggleAplayerCollapse">
              <Icon name="chevron-down" class="w-3.5 h-3.5" />
            </button>
            <button class="p-1 rounded hover:opacity-80" title="关闭" style="color: var(--text-secondary-color)" @click="state.destroyAplayer">
              <Icon name="xmark" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div :ref="state.setAplayerRef" />
      </div>
    </div>
  </Teleport>
</template>
