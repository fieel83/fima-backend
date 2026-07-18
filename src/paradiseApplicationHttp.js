export function requireParadisePrivateReviewQueued(result) {
  if (result?.reviewQueued === true && result?.status === "pending" && String(result?.id || "").trim()) {
    return result;
  }
  throw Object.assign(new Error("application_private_review_unavailable"), {
    code: "application_private_review_unavailable",
    statusCode: 503
  });
}

export function paradiseApplicationHttpError(error) {
  const requestedStatus = Number(error?.statusCode);
  const status = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;
  return {
    status,
    body: {
      error: error?.code || "application_submit_failed",
      cooldownUntil: error?.cooldownUntil || null,
      question: error?.question || null
    }
  };
}
