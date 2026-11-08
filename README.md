# Nestmate

PyNest 계정으로 쓰는 스터디 공간입니다. 접속 현황, 상태 메시지, 스터디룸(WebRTC 화상, 배경 블러), PIP를 지원합니다.

- 로그인: PyNest와 같은 Supabase 계정 (아이디/비밀번호)
- 접속 현황·상태: Supabase Realtime Presence (비공개 채널, 승인된 회원만)
- 스터디룸: 브라우저끼리 직접 연결(WebRTC). 신호 교환은 Realtime Broadcast
- 서버 구성은 PyNest 저장소의 `v500_nestmate.sql` 참고

알려진 한계: STUN만 사용하므로 일부 학교·회사 망에서는 영상이 연결되지 않을 수 있습니다(TURN 서버 필요).
