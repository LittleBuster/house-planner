import { PerspectiveCamera } from "three";
import type { Point, Project } from "./model";
import type { DoorAngles } from "./doorPhysics";
import type { WindowVentAngles } from "./windowVentPhysics";
import type { GateAngles } from "./gateSettings";
import { MAX_STEP_RISE } from "./entrySteps";
import {
  BODY_RADIUS,
  createColliders,
  EYE_HEIGHT,
  findWalkSpawn,
  isWalkable,
  movePerson,
  PERSON_HEIGHT,
  RUN_SPEED,
  WALK_SPEED,
  beginJump,
  stepJump,
  jumpHeadroom,
  walkingSurface,
  type JumpState,
  type Collider,
} from "./walkPhysics";

export type WalkState = {
  active: boolean;
  input: "cursor" | "native" | "pointer" | "drag";
  position: Point;
  yaw: number;
  blocked: boolean;
  running: boolean;
  jumping: boolean;
};

declare global {
  interface Window {
    domplanMouseDelta?: (x: number, y: number) => void;
    domplanPointerCapture?: (captured: boolean) => void;
  }
}

export class WalkControls {
  private colliders: Collider[] = [];
  private colliderHeight = -1;
  private surface = {height:0,steps:false};
  private project: Project;
  private doorAngles:DoorAngles|undefined;
  private ventAngles:WindowVentAngles|undefined;
  private gateAngles:GateAngles|undefined;
  private leafSignature="";
  private position: Point = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private active = false;
  private input: WalkState["input"] = "cursor";
  private dragging = false;
  private previousPointer: Point | null = null;
  private suspended = false;
  private blocked = false;
  private running = false;
  private jump: JumpState = {height: 0, velocity: 0};
  private elapsed = 0;
  private previousNativeDelta = window.domplanMouseDelta;
  private previousNativeCapture = window.domplanPointerCapture;

  constructor(
    private camera: PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    project: Project,
    private onState: (state: WalkState) => void,
  ) {
    this.project = project;
    this.camera.rotation.order = "YXZ";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Прогулка по дому от первого лица");
    window.domplanMouseDelta = (dx, dy) => {
      if (this.active && this.input === "native") this.look(dx, dy);
    };
    window.domplanPointerCapture = (captured) => {
      if (!this.active) return;
      if (!captured && this.input === "native") {
        this.pause();
        return;
      }
      this.input = captured ? "native" : "drag";
      this.emit();
    };
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    document.addEventListener("mousemove", this.mouseMove);
    document.addEventListener("pointerlockchange", this.pointerLockChange);
    document.addEventListener("pointerlockerror", this.pointerLockError);
    document.addEventListener("visibilitychange", this.visibilityChange);
    window.addEventListener("blur", this.pause);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("contextmenu", this.contextMenu);
    canvas.addEventListener("blur", this.pause);
    this.reset();
  }

  private emit() {
    this.canvas.dataset.active = String(this.active);
    this.canvas.dataset.input = this.input;
    this.onState({
      active: this.active,
      input: this.input,
      position: { ...this.position },
      yaw: this.yaw,
      blocked: this.blocked,
      running: this.running,
      jumping: this.jump.height > 0 || this.jump.velocity > 0,
    });
  }
  private syncCamera() {
    this.camera.position.set(this.position.x, EYE_HEIGHT + this.footHeight, this.position.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.canvas.dataset.x = this.position.x.toFixed(5);
    this.canvas.dataset.z = this.position.y.toFixed(5);
    this.canvas.dataset.eyeHeight = String(EYE_HEIGHT + this.jump.height);
    this.canvas.dataset.footHeight = String(this.footHeight);
    this.canvas.dataset.jumpHeight = this.jump.height.toFixed(5);
    this.canvas.dataset.grounded = String(this.jump.height === 0 && this.jump.velocity === 0);
    this.canvas.dataset.personHeight = String(PERSON_HEIGHT);
    this.canvas.dataset.yaw = String(this.yaw);
  }
  private get footHeight() { return this.surface.height + this.jump.height; }
  private collidersAt(height: number) {
    if (this.colliderHeight !== height) {
      this.colliders = createColliders(this.project,.025,height,this.doorAngles,this.ventAngles,this.gateAngles);
      this.colliderHeight = height;
    }
    return this.colliders;
  }
  reset = () => {
    this.keys.clear();
    const spawn = findWalkSpawn(this.project, createColliders(this.project,.025,undefined,this.doorAngles,this.ventAngles,this.gateAngles));
    this.position = spawn.position;
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.blocked = false;
    this.running = false;
    this.jump = {height: 0, velocity: 0};
    this.surface = walkingSurface(this.project,this.position);
    this.syncCamera();
    this.emit();
  };
  setProject(project: Project) {
    this.project = project;
    this.surface = walkingSurface(project,this.position);
    this.colliderHeight = -1;
    if (!isWalkable(this.position, this.collidersAt(this.footHeight))) this.reset();
  }
  setOpeningAngles(doors:DoorAngles,vents:WindowVentAngles,gates:GateAngles){
    this.doorAngles=doors;
    this.ventAngles=vents;
    this.gateAngles=gates;
    const signature=JSON.stringify([[...doors],[...vents],[...gates]]);
    if(signature===this.leafSignature)return;
    this.leafSignature=signature;
    this.colliderHeight = -1;
  }
  openingInteractionState(){return {position:{...this.position},footHeight:this.footHeight,input:this.input};}
  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) this.pause();
  }

  start = (capture = true) => {
    if (this.suspended) return;
    this.active = true;
    this.input = "drag";
    this.keys.clear();
    this.canvas.focus({ preventScroll: true });
    this.emit();
    const bridge = window.webkit?.messageHandlers?.domplan;
    if (bridge) bridge.postMessage({ type: "walkCapture", enabled: true });
    else if (capture && this.canvas.requestPointerLock) {
      try {
        const result = this.canvas.requestPointerLock();
        result?.catch(() => this.pointerLockError());
      } catch {
        this.pointerLockError();
      }
    }
  };
  pause = () => {
    if (!this.active && this.input === "cursor") return;
    const native = this.input === "native";
    this.active = false;
    this.input = "cursor";
    this.keys.clear();
    this.dragging = false;
    this.previousPointer = null;
    this.running = false;
    this.blocked = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (native)
      window.webkit?.messageHandlers?.domplan?.postMessage({
        type: "walkCapture",
        enabled: false,
      });
    this.emit();
  };
  private keyDown = (event: KeyboardEvent) => {
    if (
      !this.active ||
      this.suspended ||
      (event.target as HTMLElement)?.matches?.("input,textarea,[contenteditable]")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.pause();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      this.keys.clear();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat && !this.keys.has("Space")) this.jump = beginJump(this.jump);
      this.keys.add("Space");
      this.emit();
      return;
    }
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
      ].includes(event.code)
    ) {
      event.preventDefault();
      this.keys.add(event.code);
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    if (event.code === "Space" && this.active) event.preventDefault();
    this.keys.delete(event.code);
  };
  private visibilityChange = () => {
    if (document.hidden) this.pause();
  };
  private pointerLockChange = () => {
    if (document.pointerLockElement === this.canvas) {
      this.input = "pointer";
      this.emit();
    } else if (this.input === "pointer") this.pause();
  };
  private pointerLockError = () => {
    if (this.active) {
      this.input = "drag";
      this.emit();
    }
  };
  private contextMenu = (event: Event) => event.preventDefault();
  private pointerDown = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      !this.active ||
      this.input === "native" ||
      this.input === "pointer"
    )
      return;
    this.dragging = true;
    this.previousPointer = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus({ preventScroll: true });
  };
  private pointerUp = () => {
    this.dragging = false;
    this.previousPointer = null;
  };
  private look(dx: number, dy: number) {
    this.yaw -= dx * 0.0024;
    this.pitch = Math.max(
      -Math.PI * 0.46,
      Math.min(Math.PI * 0.46, this.pitch - dy * 0.0024),
    );
    this.syncCamera();
  }
  private mouseMove = (event: MouseEvent) => {
    if (!this.active) return;
    if (this.input === "pointer") this.look(event.movementX, event.movementY);
    else if (this.dragging && this.previousPointer) {
      this.look(
        event.clientX - this.previousPointer.x,
        event.clientY - this.previousPointer.y,
      );
      this.previousPointer = { x: event.clientX, y: event.clientY };
    }
  };
  update(deltaTime: number) {
    if (!this.active || this.suspended) return;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(.05, deltaTime)) : 0;
    if (this.jump.height > 0 || this.jump.velocity !== 0)
      this.jump = stepJump(this.jump, dt, Math.max(0,jumpHeadroom(this.project,this.position,BODY_RADIUS,this.ventAngles)-this.surface.height));
    let forward =
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    let right =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const norm = Math.hypot(forward, right);
    this.running =
      norm > 0 && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
    this.blocked = false;
    if (norm > 0) {
      forward /= norm;
      right /= norm;
      const length =
        (this.running ? RUN_SPEED : WALK_SPEED) * dt;
      const delta = {
        x:
          (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * length,
        y:
          (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) * length,
      };
      const foot = this.footHeight;
      const previous = this.position;
      const next = movePerson(this.position, delta, this.collidersAt(foot));
      const surface = walkingSurface(this.project,next);
      const rise = surface.height-this.surface.height;
      const canStep = !this.jump.height && !this.jump.velocity &&
        (surface.steps || this.surface.steps) && Math.abs(rise) <= MAX_STEP_RISE+1e-6;
      if ((surface.height <= foot+1e-6 || canStep) &&
          (!canStep || rise <= 0 || isWalkable(next,this.collidersAt(surface.height)))) {
        this.position = next;
        this.surface = surface;
        if (canStep || surface.height >= foot-1e-6 && this.jump.velocity <= 0)
          this.jump = {height:0,velocity:0};
        else
          this.jump = {height:Math.max(0,foot-surface.height),velocity:this.jump.velocity};
      }
      this.blocked =
        Math.hypot(
          this.position.x - previous.x - delta.x,
          this.position.y - previous.y - delta.y,
        ) > 0.001;
    }
    this.syncCamera();
    this.elapsed += deltaTime;
    if (this.elapsed > 0.08) {
      this.elapsed = 0;
      this.emit();
    }
  }
  dispose() {
    this.pause();
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    document.removeEventListener("mousemove", this.mouseMove);
    document.removeEventListener("pointerlockchange", this.pointerLockChange);
    document.removeEventListener("pointerlockerror", this.pointerLockError);
    document.removeEventListener("visibilitychange", this.visibilityChange);
    window.removeEventListener("blur", this.pause);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
    this.canvas.removeEventListener("blur", this.pause);
    window.domplanMouseDelta = this.previousNativeDelta;
    window.domplanPointerCapture = this.previousNativeCapture;
  }
}
