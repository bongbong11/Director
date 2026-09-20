import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';

export function supportedProfiles() {
  try { return ConnectionManagerRequestService.getSupportedProfiles(); } catch { return []; }
}

export async function translatePrompt(profileId, exactPrompt) {
  if (!profileId) throw new Error('설정 탭에서 번역 연결 프로필을 선택하세요.');
  const prompt = [
    { role: 'system', content: 'Translate the provided SillyTavern instruction into clear, faithful Korean for a human review panel. Preserve every directive and condition. Do not add advice or story content. Output Korean only.' },
    { role: 'user', content: exactPrompt }
  ];
  const response = await ConnectionManagerRequestService.sendRequest(profileId, prompt, 2000, { stream: false, extractData: true, includePreset: false, includeInstruct: true });
  if (typeof response?.content !== 'string' || !response.content.trim()) throw new Error('번역 응답이 비어 있습니다.');
  return response.content.trim();
}
