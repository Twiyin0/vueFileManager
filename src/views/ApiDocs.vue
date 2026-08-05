<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownDoc from '@/components/MarkdownDoc.vue'

const route = useRoute()

const isEnglish = computed(() => route.query.lang === 'en')
const docSrc = computed(() => isEnglish.value ? '/API_en.md' : '/API.md')
const linkMap = computed(() => ({
  './API.md': '/api-docs',
  './API_en.md': '/api-docs?lang=en',
  '/API.md': '/api-docs',
  '/API_en.md': '/api-docs?lang=en'
}))
</script>

<template>
  <MarkdownDoc :src="docSrc" :link-map="linkMap" />
</template>
