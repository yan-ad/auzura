<script setup lang="ts">
const route = useRoute();
const router = useRouter();

await router.replace({
  path: `/${route.params.organization}/${route.params.project}/tasks`,
  query: route.query,
});
</script>

<template>
  <div />
</template>
