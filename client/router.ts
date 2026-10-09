import type { Component } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { routeTable, type Access } from '../src/routes'
import { decide } from './guards'
import { typedProfile } from './lib/onboarding'
import { scrollFor } from './lib/scroll'
import { loadMe } from './lib/session'
import AccessRequestedScreen from './screens/AccessRequestedScreen.vue'
import ApplicantsScreen from './screens/ApplicantsScreen.vue'
import AskScreen from './screens/AskScreen.vue'
import ChallengeScreen from './screens/ChallengeScreen.vue'
import CockpitScreen from './screens/CockpitScreen.vue'
import ConnectScreen from './screens/ConnectScreen.vue'
import ImpressumScreen from './screens/ImpressumScreen.vue'
import InvitesScreen from './screens/InvitesScreen.vue'
import LoginScreen from './screens/LoginScreen.vue'
import MatchesScreen from './screens/MatchesScreen.vue'
import MembersScreen from './screens/MembersScreen.vue'
import MemberScreen from './screens/MemberScreen.vue'
import NotFoundScreen from './screens/NotFoundScreen.vue'
import NotificationsScreen from './screens/NotificationsScreen.vue'
import OnboardingPrivacyScreen from './screens/OnboardingPrivacyScreen.vue'
import OnboardingProfileScreen from './screens/OnboardingProfileScreen.vue'
import OnboardingUsageScreen from './screens/OnboardingUsageScreen.vue'
import OfferDoneScreen from './screens/OfferDoneScreen.vue'
import OfferNoteScreen from './screens/OfferNoteScreen.vue'
import OfferScreen from './screens/OfferScreen.vue'
import OutboxScreen from './screens/OutboxScreen.vue'
import SettingsScreen from './screens/SettingsScreen.vue'
import PrivacyScreen from './screens/PrivacyScreen.vue'
import ProfileScreen from './screens/ProfileScreen.vue'
import RequestContactScreen from './screens/RequestContactScreen.vue'
import RequestScreen from './screens/RequestScreen.vue'
import SignInScreen from './screens/SignInScreen.vue'
import TermsScreen from './screens/TermsScreen.vue'
import TrendPickerScreen from './screens/TrendPickerScreen.vue'
import TrendScreen from './screens/TrendScreen.vue'
import WelcomeScreen from './screens/WelcomeScreen.vue'
import {
  isStaleChunk,
  reloadForStaleChunk,
  settledAfterReload,
} from './lib/stale-chunk'

/**
 * Builds a router record from the shared route table (ADR 0017), so the client
 * cannot invent a path the server has never heard of. An unknown name throws at
 * startup rather than 404-ing in front of a member.
 */
function screen(
  name: string,
  component: Component | (() => Promise<Component>),
): RouteRecordRaw {
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
  scrollBehavior: (to, from, saved) => scrollFor(to.path, from.path, saved),
  routes: [
    screen('entry', LoginScreen),
    screen('login', LoginScreen),
    screen('sign-in', SignInScreen),
    screen('access-requested', AccessRequestedScreen),
    screen('onboarding', OnboardingProfileScreen),
    screen('onboarding-privacy', OnboardingPrivacyScreen),
    screen('onboarding-usage', OnboardingUsageScreen),
    screen('privacy', PrivacyScreen),
    screen('terms', TermsScreen),
    screen('impressum', ImpressumScreen),
    screen('game', () => import('./screens/GameScreen.vue')),
    screen('game-leaderboard', () => import('./screens/LeaderboardScreen.vue')),
    screen('welcome', WelcomeScreen),
    screen('profile', ProfileScreen),
    screen('notifications', NotificationsScreen),
    screen('ask', AskScreen),
    screen('challenge', ChallengeScreen),
    screen('trend-picker', TrendPickerScreen),
    screen('matches', MatchesScreen),
    screen('trend', TrendScreen),
    screen('connect', ConnectScreen),
    screen('cockpit', CockpitScreen),
    screen('offer', OfferScreen),
    screen('offer-note', OfferNoteScreen),
    screen('offer-done', OfferDoneScreen),
    screen('request', RequestScreen),
    screen('request-contact', RequestContactScreen),
    screen('admin-applicants', ApplicantsScreen),
    screen('admin-invites', InvitesScreen),
    screen('admin-members', MembersScreen),
    screen('admin-member', MemberScreen),
    screen('admin-outbox', OutboxScreen),
    screen('admin-settings', SettingsScreen),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundScreen },
  ],
})

// A tab opened before a deploy asks for screens' files the deploy replaced;
// load the page afresh there rather than leave the tap without an answer.
router.onError((error, to) => {
  if (isStaleChunk(error)) reloadForStaleChunk(to.fullPath)
})
router.afterEach((_to, _from, failure) => {
  if (failure === undefined) settledAfterReload()
})

router.beforeEach(async (to) => {
  if (to.name === 'not-found') return true

  const decision = decide(
    {
      path: to.path,
      fullPath: to.fullPath,
      access: (to.meta['access'] as Access | undefined) ?? 'public',
      permission: to.meta['permission'] as string | undefined,
    },
    await loadMe(),
    typedProfile() !== null,
  )

  if (decision.kind === 'redirect') return decision.to
  if (decision.kind === 'not-found') {
    return {
      name: 'not-found',
      params: { pathMatch: to.path.slice(1).split('/') },
      query: to.query,
      hash: to.hash,
      replace: true,
    }
  }
  return true
})
