import Phaser from 'phaser';

const PLAYER_SPEED = 260;
const ACCEL = 1600; // px/s^2 — разгон и торможение (шаг 1: инерция)
const DASH_SPEED = 700; // шаг 2: рывок
const DASH_TIME = 140; // мс
const DASH_COOLDOWN = 800; // мс
const ENEMY_SPEED = 85; // шаг 5: враги
const ENEMY_RADIUS = 16;
const WIN_SCORE = 10; // шаг 4: цель

type State = 'playing' | 'won' | 'lost';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private target!: Phaser.GameObjects.Arc;
  private enemies: Phaser.GameObjects.Arc[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private scoreText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;

  private score = 0;
  private state: State = 'playing';
  private vx = 0;
  private vy = 0;
  private lastDirX = 1;
  private lastDirY = 0;
  private dashTimeLeft = 0;
  private dashCooldownLeft = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // Шаг 6: create() вызывается и при restart — поэтому сбрасываем всё состояние здесь.
    this.score = 0;
    this.state = 'playing';
    this.vx = 0;
    this.vy = 0;
    this.lastDirX = 1;
    this.lastDirY = 0;
    this.dashTimeLeft = 0;
    this.dashCooldownLeft = 0;
    this.enemies = [];

    const { width, height } = this.scale;

    this.add
      .text(width / 2, 28, 'GAME DEV STARTER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(
        width / 2,
        68,
        'Стрелки / WASD — движение, Space — рывок (неуязвим). Собери 10 кругов, беги от красных.',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '16px',
          color: '#cbd5e1',
        },
      )
      .setOrigin(0.5, 0);

    this.player = this.add.rectangle(width / 2, height / 2, 42, 42, 0x38bdf8);
    this.target = this.add.circle(width * 0.72, height * 0.52, 18, 0xfacc15);

    this.scoreText = this.add.text(24, height - 48, `Score: 0 / ${WIN_SCORE}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
    });

    this.dashText = this.add
      .text(width - 24, height - 48, 'Dash: готов', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#86efac',
      })
      .setOrigin(1, 0);

    this.messageText = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '44px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: '#000000aa',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.dashKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Restart по клику — только когда игра закончена.
    this.input.on('pointerdown', () => {
      if (this.state !== 'playing') this.scene.restart();
    });

    this.spawnEnemy();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.scene.restart();
      return;
    }
    if (this.state !== 'playing') return;

    const seconds = delta / 1000;

    this.movePlayer(seconds, delta);
    this.keepPlayerOnScreen();
    this.updateEnemies(seconds);
    this.checkTarget();
    this.checkEnemies();
  }

  // Шаг 1 + 2: движение с инерцией и рывок.
  private movePlayer(seconds: number, deltaMs: number): void {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      this.lastDirX = dx;
      this.lastDirY = dy;
    }

    this.dashCooldownLeft = Math.max(0, this.dashCooldownLeft - deltaMs);

    if (
      Phaser.Input.Keyboard.JustDown(this.dashKey) &&
      this.dashCooldownLeft === 0 &&
      this.dashTimeLeft === 0
    ) {
      this.dashTimeLeft = DASH_TIME;
      this.dashCooldownLeft = DASH_COOLDOWN;
      this.player.setFillStyle(0xffffff);
    }

    if (this.dashTimeLeft > 0) {
      this.dashTimeLeft -= deltaMs;
      this.vx = this.lastDirX * DASH_SPEED;
      this.vy = this.lastDirY * DASH_SPEED;
      if (this.dashTimeLeft <= 0) {
        this.dashTimeLeft = 0;
        this.player.setFillStyle(0x38bdf8);
      }
    } else {
      // Скорость плавно стремится к желаемой — получается разгон и скольжение.
      const step = ACCEL * seconds;
      this.vx = approach(this.vx, dx * PLAYER_SPEED, step);
      this.vy = approach(this.vy, dy * PLAYER_SPEED, step);
    }

    this.player.x += this.vx * seconds;
    this.player.y += this.vy * seconds;

    if (this.dashCooldownLeft > 0) {
      this.dashText.setText(`Dash: ${(this.dashCooldownLeft / 1000).toFixed(1)}s`).setColor('#fca5a5');
    } else {
      this.dashText.setText('Dash: готов').setColor('#86efac');
    }
  }

  private keepPlayerOnScreen(): void {
    const half = this.player.width / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, this.scale.width - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, 110 + half, this.scale.height - half);
  }

  // Шаг 5: враги медленно преследуют игрока.
  private updateEnemies(seconds: number): void {
    for (const enemy of this.enemies) {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      enemy.x += Math.cos(angle) * ENEMY_SPEED * seconds;
      enemy.y += Math.sin(angle) * ENEMY_SPEED * seconds;
    }
  }

  private spawnEnemy(): void {
    const { width, height } = this.scale;
    let x = 0;
    let y = 0;
    // Спавним подальше от игрока, чтобы не убить мгновенно.
    for (let i = 0; i < 20; i++) {
      x = Phaser.Math.Between(40, width - 40);
      y = Phaser.Math.Between(140, height - 40);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 250) break;
    }
    const enemy = this.add.circle(x, y, ENEMY_RADIUS, 0xef4444);
    this.enemies.push(enemy);
  }

  // Шаг 3 + 4: реакция на сбор и цель.
  private checkTarget(): void {
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.target.x,
      this.target.y,
    );
    if (distance > 42) return;

    this.score += 1;
    this.scoreText.setText(`Score: ${this.score} / ${WIN_SCORE}`);

    // Реакция: «поп» у игрока и лёгкая тряска камеры.
    this.tweens.add({
      targets: this.player,
      scale: { from: 1.3, to: 1 },
      duration: 150,
    });
    this.cameras.main.shake(80, 0.003);

    if (this.score >= WIN_SCORE) {
      this.endGame('won');
      return;
    }

    this.target.setPosition(
      Phaser.Math.Between(60, this.scale.width - 60),
      Phaser.Math.Between(140, this.scale.height - 80),
    );
    this.spawnEnemy(); // риск растёт вместе с очками
  }

  // Шаг 5: условие поражения (во время рывка игрок неуязвим).
  private checkEnemies(): void {
    if (this.dashTimeLeft > 0) return;
    const hitDistance = this.player.width / 2 + ENEMY_RADIUS - 4;
    for (const enemy of this.enemies) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (d < hitDistance) {
        this.cameras.main.shake(250, 0.01);
        this.player.setFillStyle(0xef4444);
        this.endGame('lost');
        return;
      }
    }
  }

  // Шаг 6: экран конца игры и перезапуск.
  private endGame(result: 'won' | 'lost'): void {
    this.state = result;
    const title = result === 'won' ? 'ПОБЕДА!' : 'ТЫ ПРОИГРАЛ';
    this.messageText
      .setText(`${title}\nСчёт: ${this.score}\n\nR или клик — заново`)
      .setVisible(true);
  }
}

function approach(current: number, target: number, step: number): number {
  if (current < target) return Math.min(current + step, target);
  if (current > target) return Math.max(current - step, target);
  return target;
}