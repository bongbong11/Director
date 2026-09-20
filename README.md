# NPC · 사건 생성 확장 (v0.4.0)

Jev로 현재 RP 문맥을 판정하고, 필요한 NPC·사건·갈등 지시만 SillyTavern 생성 프롬프트에 넣는 확장입니다.

## 설치

이 버전은 **프런트엔드 확장과 서버 플러그인을 둘 다 설치**해야 Jev AUTO가 동작합니다.

1. 이 저장소를 SillyTavern의 `data/<사용자>/extensions/third-party/Director`에 설치하거나 기존 확장을 업데이트합니다.
2. 저장소 안의 `server-plugin` 폴더를 SillyTavern 설치 폴더의 `plugins/npc-event-director`로 복사합니다.
3. SillyTavern의 `config.yaml`에서 다음 값을 켭니다.

   ```yaml
   enableServerPlugins: true
   ```

4. SillyTavern 서버를 완전히 종료한 뒤 다시 실행합니다.
5. **마법봉 메뉴 → NPC · 사건 생성 → 설정**에서 Jev API key를 저장합니다.

`enableCorsProxy`는 필요하지 않습니다. 브라우저는 같은 출처의 서버 플러그인에만 요청하고, TypeSafe API 호출은 SillyTavern 서버가 담당합니다.

서버 시작 로그에 아래 문구가 보이면 서버 플러그인이 로드된 것입니다.

```text
Initializing plugin from .../plugins/npc-event-director/index.mjs
```

## 키 보관과 이전

- Jev 키는 현재 SillyTavern 사용자의 데이터 폴더에 `.npc-event-director.json`으로 저장됩니다.
- 키는 브라우저에서 TypeSafe로 직접 전송되지 않으며, API 응답에도 다시 노출되지 않습니다.
- 이전 버전이 브라우저 `localStorage`에 저장한 키가 있으면 최초 연결 시 서버 저장소로 한 번 이전한 뒤 브라우저 사본을 삭제합니다.
- 키 저장 파일은 지원되는 운영체제에서 소유자만 읽고 쓸 수 있도록 권한 `0600`을 적용합니다.

## 동작

- `OFF`: 해당 기능을 끕니다.
- `AUTO`: 설정한 기회 확률과 Jev의 문맥 판정을 함께 사용합니다.
- `ON`: 매 IC 생성에 해당 지시를 넣습니다.
- 최근 채팅 기본 10개와 현재 활성 장르를 Jev 판정 문맥으로 보냅니다.
- Jev가 허용한 짧은 지시를 `In-chat depth 0 / system`으로 주입하고 응답 뒤 제거합니다.
- OOC 입력 `(ooc:`은 해당 생성의 주입과 추첨을 건너뜁니다.
- 빌런 프로필과 진행 상태는 채팅별로 유지하며 **빌런 이벤트 종료**로 초기화합니다.
- 미리보기 번역은 선택한 SillyTavern 연결 프로필을 사용하며 실제 RP 연결에는 영향을 주지 않습니다.

모델, 기능, 확률, 번역 프로필 선택은 채팅별 메타데이터에 저장됩니다. Jev 키만 서버의 사용자별 비밀 파일에 별도로 저장됩니다.

## 오류 확인

패널 하단에는 Jev가 돌려준 오류 원인이 표시됩니다.

- `API 키가 유효하지 않습니다`: TypeSafe가 키를 인증하지 못함 (`401`)
- `이 키 또는 계정에 Jev API 이용 권한이 없습니다`: 계정 승인 또는 권한 문제 (`403`)
- `Jev 서버 플러그인이 없습니다`: 플러그인 복사, `enableServerPlugins`, 서버 재시작 여부 확인
- `Jev 요청 한도를 초과했습니다`: API 한도 초과 (`429`)

메인 RP 생성에는 현재 SillyTavern 연결을 그대로 사용하므로 별도 LLM 연결 프로필이나 임베딩 키가 필요하지 않습니다.
