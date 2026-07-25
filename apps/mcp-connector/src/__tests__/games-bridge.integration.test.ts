import { StdioGamesRuntime } from '../games-bridge';

jest.setTimeout(30_000);

describe('StdioGamesRuntime', () => {
  let runtime: StdioGamesRuntime;

  beforeEach(() => {
    runtime = new StdioGamesRuntime();
  });

  afterEach(async () => {
    await runtime.disconnect();
  });

  it('discovers server tools and executes a real game turn over stdio', async () => {
    const health = await runtime.health();
    expect(health).toMatchObject({
      status: 'OK',
      game: { id: 'morning-decision-v1', ready: true },
    });

    const tools = await runtime.listCapabilities();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'health_check',
        'load_game',
        'start_game',
        'make_choice',
        'plan_realtime_mesh',
      ]),
    );

    const session = await runtime.startSession('connector-integration-player');
    expect(session).toMatchObject({
      gameId: 'morning-decision-v1',
      sceneId: 'wake_up',
      completed: false,
    });
    expect(session.sessionId).toEqual(expect.any(String));

    const choices = session.choices as Array<{ id: string }>;
    expect(choices.length).toBeGreaterThan(0);
    const turn = await runtime.makeChoice(String(session.sessionId), choices[0].id);
    expect(turn).toMatchObject({
      sessionId: session.sessionId,
      gameId: 'morning-decision-v1',
    });
    expect(turn.sceneId).not.toBe('wake_up');
  });
});
