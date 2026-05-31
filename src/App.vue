<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const authStore = useAuthStore()
const themeStore = useThemeStore()

onMounted(async () => {
  if (localStorage.getItem('token')) {
    await authStore.fetchUser()
  }
})
</script>

<template>
  <router-view />
</template>
