// Rapier interaction groups: high 16 bits = membership, low 16 bits = filter.
export const G_WORLD = 0x0001;
export const G_PROP = 0x0002;
export const G_BODY = 0x0004;
/** Floors and ground: stood on, never grabbed. */
export const G_FLOOR = 0x0008;
/** Stanley's head (also part of his body): things carried overhead bump it. */
export const G_HEAD = 0x0010;

export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

/** Static level geometry collides with everything. */
export const WORLD_GROUPS = groups(G_WORLD, G_WORLD | G_PROP | G_BODY);
/** Props collide with everything. */
export const PROP_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_PROP | G_BODY);
export const FLOOR_GROUPS = groups(G_FLOOR, G_PROP | G_BODY);
/** Stanley's parts never collide with each other. */
export const BODY_GROUPS = groups(G_BODY, G_WORLD | G_FLOOR | G_PROP);
export const HEAD_GROUPS = groups(G_BODY | G_HEAD, G_WORLD | G_FLOOR | G_PROP);
/** Queries that should only see the environment, never Stanley. */
export const ENV_QUERY = groups(0xffff, G_WORLD | G_FLOOR | G_PROP);
/** What hands can grab: everything except floors and Stanley. */
export const GRAB_QUERY = groups(0xffff, G_WORLD | G_PROP);
/** Upper arms and forearms don't snag on level geometry (hands still do). */
export const ARM_GROUPS = groups(G_BODY, G_PROP);
