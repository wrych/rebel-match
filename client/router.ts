import type { Component } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { routeTable } from '../src/routes'
import LoginScreen from './screens/LoginScreen.vue'
import NotFoundScreen from './screens/NotFoundScreen.vue'

/**
 * Builds a router record from the shared route table (ADR 0017), so the client
 * cannot invent a path the server has never heard of. An unknown name throws at
 * startup rather than 404-ing in front of a member.
 */
function screen(name: string, component: Component): RouteRecordRaw {
  const route = routeTable.find((candidate) => candidate.name === name)
  if (route === undefined) {
    throw new Error(`no route named ${name} in the shared route table`)
  }

  return {
    path: route.path,
    name: route.name,
    component,
    meta: {
      access: route.access,
      ...(route.permission === undefined
        ? {}
        : { permission: route.permission }),
    },
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    screen('entry', LoginScreen),
    screen('login', LoginScreen),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundScreen },
  ],
})
