<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Layout from '@/components/Layout.vue'

const route = useRoute()

const needsLayout = computed(() => !route.meta.noLayout)
const keepAliveRouteNames = [
  'Home',
  'ShareMounts',
  'OfflineTasks',
  'Favourites',
  'MyShares',
  'Trash',
  'StoragePools',
  'WebDAV',
  'Settings',
  'ApiKeys',
  'Themes',
  'Admin'
]
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
