import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export function ticketIntakeFields(categoryId) {
  const context = {
    product_support: "Product and version",
    payment_help: "Product / purchase date (no card details)",
    license_hwid_help: "Device and error (no license key)",
    macro_timing_problem: "Macro, ping, FPS and timing",
    fake_headless: "Avatar type and step that failed",
    security_report: "Suspect account or URL (no credentials)",
    creator_partnership: "Your project and public profile",
    app_bug: "App version, device and error"
  };
  return [
    { id: "reason", label: "What happened? / Ne oldu?", required: true, minLength: 10 },
    { id: "context", label: context[categoryId] || "Product / relevant context", required: false },
    { id: "attempts", label: "Steps tried / Denediğin adımlar", required: false }
  ];
}

export function buildTicketIntakeModal(category) {
  return new ModalBuilder()
    .setCustomId(`fima_ticket_intake:${category.id}`)
    .setTitle(category.label.slice(0, 45))
    .addComponents(ticketIntakeFields(category.id).map((field) => {
      const input = new TextInputBuilder().setCustomId(field.id).setLabel(field.label)
        .setStyle(TextInputStyle.Paragraph).setRequired(field.required).setMaxLength(1000);
      if (field.minLength) input.setMinLength(field.minLength);
      return new ActionRowBuilder().addComponents(input);
    }));
}
