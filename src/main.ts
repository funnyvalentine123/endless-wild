import { Game } from './app/Game';

function bootstrap(): void {
  try {
    const game = new Game();
    game.start();
  } catch (error) {
    console.error(error);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.textContent = `引擎加载失败，请刷新重试：${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}

bootstrap();
