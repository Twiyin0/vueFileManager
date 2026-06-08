<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Layout from '@/components/Layout.vue'

const authStore = useAuthStore()
const route = useRoute()

const needsLayout = computed(() => !route.meta.noLayout)

onMounted(async () => {
  if (localStorage.getItem('token')) {
    await authStore.fetchUser()
  }
})
</script>

<template>
  <Layout v-if="needsLayout">
    <router-view />
  </Layout>
  <router-view v-else />
</template>
