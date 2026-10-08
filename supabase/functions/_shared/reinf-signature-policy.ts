// Fail closed when XMLDSig signer leaves an event unsigned or changes its Id.
const eventPattern = /<(evt[A-Za-z]+)\s+Id="([^"]+)">([\s\S]*?)<\/\1>/g;

export function assertAllReinfEventsSigned(unsignedXml: string, signedXml: string): void {
  const expected = [...unsignedXml.matchAll(eventPattern)];
  const actual = [...signedXml.matchAll(eventPattern)];
  const allEventTags = [...unsignedXml.matchAll(/<evt[A-Za-z0-9_]+(?=[\s>])/g)];
  if (expected.length === 0 || expected.length !== allEventTags.length || expected.length !== actual.length) {
    throw new Error('reinf_events_not_signed');
  }
  for (let index = 0; index < expected.length; index++) {
    const [, expectedTag, expectedId] = expected[index];
    const [, actualTag, actualId, actualContent] = actual[index];
    if (expectedTag !== actualTag || expectedId !== actualId ||
        !/<Signature\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"[^>]*>[\s\S]*?<\/Signature>/.test(actualContent)) {
      throw new Error('reinf_events_not_signed');
    }
  }
}
