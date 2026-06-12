<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Layout from '@/components/Layout.vue'

const authStore = useAuthStore()
const route = useRoute()

const needsLayout = computed(() => !route.meta.noLayout)
const keepAliveRouteNames = [
  'Home',
  'OfflineTasks',
  'Favourites',
  'MyShares',
  'Trash',
  'StoragePools',
  'WebDAV',
  'Settings',
  'ApiKeys',
  'Themes',
  'Admin',
]

onMounted(async () => {
  if (localStorage.getItem('token')) {
    await authStore.fetchUser()
  }
})
</script>

<template>
  <Layout v-if="needsLayout">
    <router-view v-slot="{ Component, route: currentRoute }">
      <keep-alive :include="keepAliveRouteNames">
        <component :is="Component" :key="currentRoute.name" />
      </keep-alive>
    </router-view>
  </Layout>
  <router-view v-else />
</template>
