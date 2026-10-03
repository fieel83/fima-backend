(() => {
  window.FimaAccountIdentity = {
    create({ post, target, message, label }) {
      const hiddenValues = new Map();
      const versions = new Map();
      return {
        reset(button, hiddenValue, available = true) {
          const id = button.dataset.revealTarget;
          versions.set(id, (versions.get(id) || 0) + 1);
          hiddenValues.set(id, hiddenValue);
          target(id).textContent = hiddenValue;
          button.disabled = !available;
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", label(id, false));
        },
        async toggle(button) {
          const id = button.dataset.revealTarget;
          if (!["accountUsername", "accountEmail"].includes(id) || button.disabled) return;
          const node = target(id);
          if (!node) return;
          if (button.getAttribute("aria-pressed") === "true") {
            node.textContent = hiddenValues.get(id);
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", label(id, false));
            return;
          }
          button.disabled = true;
          const version = versions.get(id);
          try {
            const data = await post("/api/me/identity/reveal", { field: id === "accountUsername" ? "username" : "email" });
            if (versions.get(id) !== version) return;
            if (typeof data.value !== "string" || !data.value) throw new Error("identity_not_available");
            node.textContent = data.value;
            button.setAttribute("aria-pressed", "true");
            button.setAttribute("aria-label", label(id, true));
          } catch (error) {
            if (versions.get(id) === version) message(error.message, "error");
          } finally {
            if (versions.get(id) === version) button.disabled = false;
          }
        }
      };
    }
  };
})();
