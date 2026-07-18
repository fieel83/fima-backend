import test from "node:test";
import assert from "node:assert/strict";
import { ownerIdentityStatus } from "../src/ownerAccess.js";

const requirements = {
  ownerEmail: "oyuncukaande@gmail.com",
  ownerDiscordId: "762858334440521739"
};

const verifiedAccount = () => ({
  user: {
    email: "oyuncukaande@gmail.com",
    emailNormalized: "oyuncukaande@gmail.com",
    discordUserId: "762858334440521739",
    oauthLinks: [{ provider: "discord", providerSubject: "762858334440521739" }]
  }
});
test("owner identity requires the exact FIMA account and verified Discord OAuth subject", () => {
  assert.equal(ownerIdentityStatus(verifiedAccount(), requirements).ok, true);
});

test("owner identity fails closed without a FIMA account", () => {
  assert.equal(ownerIdentityStatus(null, requirements).ok, false);
  assert.equal(ownerIdentityStatus({ user: null }, requirements).ok, false);
});

test("owner identity fails closed for the wrong account email", () => {
  const account = verifiedAccount();
  account.user.email = "other@example.com";
  account.user.emailNormalized = "other@example.com";
  assert.equal(ownerIdentityStatus(account, requirements).ok, false);
});

test("owner identity fails closed when the Discord user field and OAuth link do not both match", () => {
  const missingLink = verifiedAccount();
  missingLink.user.oauthLinks = [];
  assert.equal(ownerIdentityStatus(missingLink, requirements).ok, false);

  const wrongUserId = verifiedAccount();
  wrongUserId.user.discordUserId = "111111111111111111";
  assert.equal(ownerIdentityStatus(wrongUserId, requirements).ok, false);

  const wrongSubject = verifiedAccount();
  wrongSubject.user.oauthLinks[0].providerSubject = "111111111111111111";
  assert.equal(ownerIdentityStatus(wrongSubject, requirements).ok, false);
});
