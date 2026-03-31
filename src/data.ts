/**
 * Mock/static data for development and testing.
 * Provides sample servers, channels, messages, and member groups
 * to demonstrate UI without a backend connection.
 */

import type { Server, Message, MemberGroup } from './types';

export const SERVERS: Server[] = [
  {
    id: 'nexus',
    name: 'NEXUS HQ',
    channels: [
      { type: 'category', name: 'Information' },
      { type: 'text', name: 'announcements', active: false },
      { type: 'text', name: 'rules', active: false },
      { type: 'category', name: 'General' },
      { type: 'text', name: 'general', active: true },
      { type: 'text', name: 'clips', active: false },
      { type: 'text', name: 'off-topic', active: false },
      { type: 'category', name: 'Voice Lobbies' },
      { type: 'voice', name: 'Lobby Alpha', users: [{ name: 'VORTEX_X' }, { name: 'GhostXL' }] },
      { type: 'voice', name: 'Ranked Grind', users: [{ name: 'Prism_' }, { name: 'null404' }] },
      { type: 'voice', name: 'AFK / Chill', users: [] },
    ],
  },
  {
    id: 'zeeble',
    name: 'Zeeble Devs',
    unread: 3,
    channels: [
      { type: 'category', name: 'Development' },
      { type: 'text', name: 'frontend', active: true },
      { type: 'text', name: 'backend', active: false },
      { type: 'voice', name: 'Standup Meeting', users: [{ name: 'Zephyr' }] },
    ],
  },
  {
    id: 'apex',
    name: 'Apex Scrims',
    channels: [
      { type: 'category', name: 'Scrimmage' },
      { type: 'text', name: 'looking-for-group', active: true },
      { type: 'text', name: 'results', active: false },
    ],
  },
];

export const MESSAGES: Record<string, Message[]> = {
  general: [
    {
      id: '1',
      username: 'VORTEX_X',
      role: 'Admin',
      roleClass: 'b-admin',
      time: 'Today at 3:14 PM',
      content: 'Tournament signups are live. Top 8 gets prize pool.',
      embed: {
        title: '⚡ Weekly Tournament',
        desc: 'Saturday · 8 PM EST · Double Elimination',
        fields: [
          { label: 'PRIZE POOL', value: '$200' },
          { label: 'FORMAT', value: '3v3' },
        ],
      },
    },
    {
      id: '2',
      username: 'KAZE',
      role: 'Mod',
      roleClass: 'b-mod',
      time: 'Today at 3:20 PM',
      content: 'Crossplay is OFF this time for ranked integrity. Make sure you check your settings.',
    },
    {
      id: '3',
      username: 'Prism_',
      role: '',
      roleClass: '',
      time: 'Today at 3:22 PM',
      content: "I'm in. @null404 you duoing?",
    },
    {
      id: '4',
      username: 'null404',
      role: 'VIP',
      roleClass: 'b-vip',
      time: 'Today at 3:25 PM',
      content: 'Yeah let\'s go. Has anyone checked the new patch notes? headshot_mult reduced.',
    },
  ],
  frontend: [
    {
      id: '5',
      username: 'Zephyr',
      role: 'Admin',
      roleClass: 'b-admin',
      time: 'Today at 9:00 AM',
      content: 'New React rewrite is underway. Neumorphic design system locked in.',
    },
  ],
  'looking-for-group': [
    {
      id: '6',
      username: 'reckless',
      role: '',
      roleClass: '',
      time: 'Today at 11:45 AM',
      content: 'Need 2 for ranked. Diamond+. DM me.',
    },
  ],
};

export const MEMBER_GROUPS: MemberGroup[] = [
  {
    label: 'Admin — 2',
    members: [
      { id: 'vx', username: 'VORTEX_X', initials: 'VX', status: 'on', activity: 'Dev / Owner', roleColor: 'var(--red)' },
      { id: 'gx', username: 'GhostXL', initials: 'GX', status: 'on', activity: 'Playing Apex', roleColor: 'var(--red)' },
    ],
  },
  {
    label: 'Moderators — 3',
    members: [
      { id: 'kz', username: 'KAZE', initials: 'KZ', status: 'idle', activity: 'AFK', roleColor: 'var(--gold)' },
    ],
  },
  {
    label: 'VIP — 4',
    members: [
      { id: 'nl', username: 'null404', initials: 'NL', status: 'on', activity: 'Coding', roleColor: 'var(--accent)' },
      { id: 'ph', username: 'phntm', initials: 'PH', status: 'on', activity: 'Valorant', roleColor: 'var(--accent)' },
    ],
  },
  {
    label: 'Online — 27',
    members: [
      { id: 'pr', username: 'Prism_', initials: 'PR', status: 'on' },
      { id: 'rk', username: 'reckless', initials: 'RK', status: 'on', activity: 'Warzone' },
    ],
  },
];
