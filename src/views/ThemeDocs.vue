<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownDoc from '@/components/MarkdownDoc.vue'

const route = useRoute()

const isEnglish = computed(() => route.query.lang === 'en')
const docSrc = computed(() => isEnglish.value ? '/Plugins_en.md' : '/Plugins.md')
const linkMap = computed(() => ({
  './Plugins.md': '/theme-docs',
  './Plugins_en.md': '/theme-docs?lang=en',
  './Themes.md': '/plugin-docs',
  './Themes_en.md': '/plugin-docs?lang=en',
  '/Plugins.md': '/theme-docs',
  '/Plugins_en.md': '/theme-docs?lang=en',
  '/Themes.md': '/plugin-docs',
  '/Themes_en.md': '/plugin-docs?lang=en'
}))
</script>

<template>
  <MarkdownDoc :src="docSrc" :link-map="linkMap" />
</template>
