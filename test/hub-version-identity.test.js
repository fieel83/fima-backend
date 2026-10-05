import test from "node:test";
import assert from "node:assert/strict";
import { entitlementVersionStatus } from "../src/appVersionPolicy.js";
import { issueAppEntitlement, verifyAppEntitlement } from "../src/entitlements.js";
test("only signed Hub identity selects the Hub minimum", () => {
 const policy = { macroMinimum: "1.0.128", hubMinimum: "0.2.0" };
 assert.equal(entitlementVersionStatus("0.2.0-candidate", {clientApplication:"fima-hub"}, policy).updateRequired, false);
 for (const payload of [{}, {clientApplication:"fima-macro"}, {clientApplication:"unknown"}]) assert.equal(entitlementVersionStatus("0.2.0-candidate", payload, policy).updateRequired, true);
 assert.equal(entitlementVersionStatus("0.1.9", {clientApplication:"fima-hub"}, policy).updateRequired, true);
 assert.equal(entitlementVersionStatus("1.0.127", {}, policy).updateRequired, true);
});
test("application identity is signed and defaults to Macro", () => {
 const previous = process.env.ENTITLEMENT_SIGNING_SECRET;
 process.env.ENTITLEMENT_SIGNING_SECRET = "hub-test-signing-secret-longer-than-32-bytes";
 try { for (const clientApplication of ["fima-hub", "fima-macro", undefined]) {
 const issued = issueAppEntitlement({license:{id:"test", plan:"lifetime",status:"active"},hwid:"TEST-DEVICE",clientApplication});
 const verified = verifyAppEntitlement(issued.token);
 assert.equal(verified.ok,true);
 assert.equal(verified.payload.clientApplication,clientApplication || "fima-macro");
 } } finally { if(previous === undefined) delete process.env.ENTITLEMENT_SIGNING_SECRET; else process.env.ENTITLEMENT_SIGNING_SECRET = previous; }
});
