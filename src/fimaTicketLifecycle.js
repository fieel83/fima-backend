import { PermissionFlagsBits } from "discord.js";

export function ticketParticipantAccess(closed = false) {
  return {
    ViewChannel: !closed,
    SendMessages: !closed,
    ReadMessageHistory: !closed,
    AttachFiles: !closed,
    EmbedLinks: !closed
  };
}

export function ticketChannelOverwrites({ everyoneId, openerId, botId, supportRoleId }) {
  const participant = Object.keys(ticketParticipantAccess()).map(key => PermissionFlagsBits[key]);
  const overwrites = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: openerId, allow: [...participant] },
    { id: botId, allow: [...participant, PermissionFlagsBits.ManageChannels] }
  ];
  if (supportRoleId && ![everyoneId, openerId, botId].includes(supportRoleId)) {
    overwrites.push({ id: supportRoleId, allow: [...participant] });
  }
  return overwrites;
}

// Participant access survives restarts and changes immediately, even when
// Discord queues a cosmetic channel rename behind a rate limit.
export function ticketIsClosed(channel) {
  const opener = String(channel?.topic || "").match(/openedBy:(\d{15,25})/)?.[1];
  const access = opener && channel?.permissionOverwrites?.cache?.get(opener);
  if (access?.deny?.has(PermissionFlagsBits.ViewChannel)) return true;
  if (access?.allow?.has(PermissionFlagsBits.ViewChannel)) return false;
  return String(channel?.name || "").startsWith("closed-");
}

const renames = new Map();

export function queueTicketRename(channel, closed, onError = () => {}) {
  const name = String(channel.name || "ticket").replace(/^closed-/, "");
  const desired = closed ? `closed-${name.slice(0, 80)}` : name.slice(0, 90);
  const pending = renames.get(channel.id);
  if (pending) { pending.desired = desired; return pending.done; }
  const state = { desired, current: channel.name, done: null };
  renames.set(channel.id, state);
  state.done = (async () => {
    try {
      while (true) {
        const target = state.desired;
        if (state.current !== target) {
          await channel.setName(target);
          state.current = target;
        }
        if (state.desired === target) break;
      }
    } catch (error) { onError(error); }
    finally { renames.delete(channel.id); }
  })();
  return state.done;
}
