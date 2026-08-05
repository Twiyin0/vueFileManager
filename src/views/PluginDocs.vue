<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownDoc from '@/components/MarkdownDoc.vue'

const route = useRoute()

const isEnglish = computed(() => route.query.lang === 'en')
const docSrc = computed(() => isEnglish.value ? '/Themes_en.md' : '/Themes.md')
const linkMap = computed(() => ({
  './Themes.md': '/plugin-docs',
  './Themes_en.md': '/plugin-docs?lang=en',
  '/Themes.md': '/plugin-docs',
  '/Themes_en.md': '/plugin-docs?lang=en'
}))
</script>

<template>
  <MarkdownDoc :src="docSrc" :link-map="linkMap" />
</template>
