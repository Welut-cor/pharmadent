// Просмотрщик модели полости рта: подсветка зоны случая, мишень на поражении,
// режимы «обычно», «прозрачно» (губы и щёки насквозь) и «срез» (снимает слои со стороны зрителя).
// Имена частей — по разделу «3D: договорённость об именах» в CLAUDE.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Наружные мягкие ткани: в прозрачном режиме сквозь них видно, что внутри.
const OBOLOCHKA = /^(guba_|shcheka_)/;
const PODSVETKA = new THREE.Color(0xffb347);
const VPERED = new THREE.Vector3(0, 0.25, 1);

const NAZVANIYA = {
  desna_verh: 'Десна верхняя', desna_niz: 'Десна нижняя', yazyk: 'Язык', nebo: 'Нёбо',
  shcheka_lev: 'Щека левая', shcheka_prav: 'Щека правая',
  guba_verh: 'Верхняя губа', guba_niz: 'Нижняя губа',
  guba_verh_kayma: 'Верхняя губа — красная кайма', guba_niz_kayma: 'Нижняя губа — красная кайма',
  guba_verh_vnutr: 'Верхняя губа изнутри', guba_niz_vnutr: 'Нижняя губа изнутри',
  protez: 'Съёмный протез',
};

export function nazvanie(imya) {
  if (/^zub_\d\d$/.test(imya)) return 'Зуб ' + imya.slice(4);
  if (imya.startsWith('porazh_')) return 'Поражение';
  return NAZVANIYA[imya] || imya;
}

// Что показывать в случае: части с поражением и префикс накладок (по «Данным осмотра»).
export const SLUCHAI = {
  2: { obekty: ['guba_niz_vnutr', 'shcheka_lev'], porazh: 'porazh_02' },
};

function vidimyy(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Prosmotr {
  static async sozdat(konteyner, put) {
    const p = new Prosmotr(konteyner);
    await p.zagruzit(put);
    return p;
  }

  constructor(konteyner) {
    this.konteyner = konteyner;
    this.onVybor = null;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.localClippingEnabled = true;
    konteyner.appendChild(r.domElement);

    this.scena = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(35, 1, 0.005, 2);
    this.scena.add(this.kamera);
    this.scena.add(new THREE.HemisphereLight(0xffffff, 0x9a7f7f, 1.8));
    const svet = new THREE.DirectionalLight(0xffffff, 2.0);
    svet.position.set(0.2, 0.4, 1);
    this.kamera.add(svet); // свет от зрителя: видимая сторона всегда освещена

    this.upr = new OrbitControls(this.kamera, r.domElement);
    this.upr.enableDamping = true;
    this.upr.minDistance = 0.05;
    this.upr.maxDistance = 0.45;

    this.srez = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10);
    this.glubina = 0.25; // 0 — срез у передней стенки, 1 — у задней
    this.rezhimTek = 'obychno';
    this.zona = [];
    this.porazheniya = [];
    this.misheni = new THREE.Group();
    this.scena.add(this.misheni);
    this.polet = null;

    this.ukazatel(r.domElement);
    new ResizeObserver(() => this.razmer()).observe(konteyner);
    this.razmer();
    r.setAnimationLoop((t) => this.kadr(t));
  }

  async zagruzit(put) {
    const gltf = await new GLTFLoader().loadAsync(put);
    this.model = gltf.scene;
    this.chasti = new Map(); // имя части → узел; у части из двух материалов меши внутри узла
    this.model.traverse((o) => {
      if (o.name && gltf.parser.associations.get(o)?.nodes !== undefined) this.chasti.set(o.name, o);
    });
    this.model.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.chast = this.chastDlya(m);
      m.material = m.material.clone(); // у каждой части свой материал — подсвечиваем по отдельности
      if (m.userData.chast.startsWith('porazh_')) {
        Object.assign(m.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      } else {
        m.material.clippingPlanes = [this.srez];
      }
    });
    for (const [imya, o] of this.chasti) if (imya.startsWith('porazh_')) o.visible = false;
    this.scena.add(this.model);
    const sfera = new THREE.Box3().setFromObject(this.model).getBoundingSphere(new THREE.Sphere());
    this.centr = sfera.center;
    this.R = sfera.radius;
    this.obzor(false);
  }

  chastDlya(o) {
    while (o && !this.chasti.has(o.name)) o = o.parent;
    return o ? o.name : '';
  }

  setki(imya) {
    const out = [];
    this.chasti.get(imya)?.traverse((m) => m.isMesh && out.push(m));
    return out;
  }

  /** Показать случай: подсветить части obekty, включить накладки с префиксом porazh и навести камеру. */
  pokazat({ obekty = [], porazh = '' } = {}) {
    for (const m of this.zona) m.material.emissive.setRGB(0, 0, 0);
    this.zona = obekty.flatMap((imya) => this.setki(imya));
    this.porazheniya = [];
    for (const [imya, o] of this.chasti) {
      if (!imya.startsWith('porazh_')) continue;
      o.visible = porazh !== '' && imya.startsWith(porazh + '_');
      if (o.visible) this.porazheniya.push(o);
    }
    this.misheni.clear();
    for (const o of this.porazheniya) {
      const s = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.22, 48),
        new THREE.MeshBasicMaterial({ color: 0x0fa596, transparent: true, depthTest: false, side: THREE.DoubleSide }),
      );
      m.position.copy(s.center);
      m.userData.r = s.radius * 1.7;
      m.renderOrder = 10;
      this.misheni.add(m);
    }
    this.primenit();
    this.kZone();
  }

  /** Режим: 'obychno', 'prozrachno' или 'srez'. */
  rezhim(imya) {
    this.rezhimTek = imya;
    this.primenit();
  }

  primenit() {
    const prozr = this.rezhimTek === 'prozrachno';
    const vZone = new Set(this.zona);
    this.model.traverse((m) => {
      if (!m.isMesh || m.userData.chast.startsWith('porazh_')) return;
      const skvoz = prozr && OBOLOCHKA.test(m.userData.chast);
      m.material.transparent = skvoz;
      m.material.opacity = skvoz ? (vZone.has(m) ? 0.4 : 0.18) : 1;
      m.material.depthWrite = !skvoz;
      m.material.needsUpdate = true;
    });
  }

  dalnost(radius) {
    const v = THREE.MathUtils.degToRad(this.kamera.fov);
    const g = 2 * Math.atan(Math.tan(v / 2) * this.kamera.aspect);
    return radius / Math.sin(Math.min(v, g) / 2);
  }

  letet(kuda, cel, plavno = true) {
    if (!plavno) {
      this.kamera.position.copy(kuda);
      this.upr.target.copy(cel);
      return;
    }
    this.polet = { ot: this.kamera.position.clone(), do: kuda, cel0: this.upr.target.clone(), cel };
  }

  /** Камера к поражению (или к подсвеченным частям). */
  kZone() {
    const ob = this.porazheniya.length ? this.porazheniya : this.zona;
    if (!ob.length) return this.obzor();
    const box = new THREE.Box3();
    ob.forEach((o) => box.expandByObject(o));
    const s = box.getBoundingSphere(new THREE.Sphere());
    const nap = s.center.clone().sub(this.centr).normalize().add(VPERED).normalize();
    const d = THREE.MathUtils.clamp(this.dalnost(Math.max(s.radius, 0.012) * 2.3), 0.11, 0.3);
    this.letet(s.center.clone().addScaledVector(nap, d), s.center.clone());
  }

  /** Вся модель спереди. */
  obzor(plavno = true) {
    const nap = new THREE.Vector3(0, 0.1, 1).normalize();
    this.letet(this.centr.clone().addScaledVector(nap, this.dalnost(this.R) * 1.05), this.centr.clone(), plavno);
  }

  kadr(t) {
    if (this.polet) {
      const p = this.polet;
      p.t0 ??= t;
      const k = Math.min(1, (t - p.t0) / 800);
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (2 - 2 * k) ** 3 / 2;
      this.kamera.position.lerpVectors(p.ot, p.do, e);
      this.upr.target.lerpVectors(p.cel0, p.cel, e);
      if (k === 1) this.polet = null;
    }
    this.upr.update();
    if (this.rezhimTek === 'srez') {
      // плоскость поперёк взгляда: всё ближе неё к зрителю не рисуется
      const v = this.kamera.getWorldDirection(new THREE.Vector3());
      const D = this.kamera.position.distanceTo(this.upr.target);
      this.srez.normal.copy(v);
      this.srez.constant = -(v.dot(this.kamera.position) + D - this.R + this.glubina * 2 * this.R);
    } else {
      this.srez.normal.set(0, 0, -1);
      this.srez.constant = 10;
    }
    const puls = 0.5 + 0.5 * Math.sin(t / 260);
    for (const m of this.zona) {
      m.material.emissive.copy(PODSVETKA);
      m.material.emissiveIntensity = 0.12 + 0.22 * puls;
    }
    for (const m of this.misheni.children) {
      m.quaternion.copy(this.kamera.quaternion);
      m.scale.setScalar(m.userData.r * (1 + 0.25 * puls));
      m.material.opacity = 0.95 - 0.5 * puls;
    }
    this.renderer.render(this.scena, this.kamera);
  }

  ukazatel(el) {
    let x0 = 0;
    let y0 = 0;
    el.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      y0 = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.model || Math.hypot(e.clientX - x0, e.clientY - y0) > 6) return;
      const r = el.getBoundingClientRect();
      const luch = new THREE.Raycaster();
      luch.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.kamera);
      const h = luch.intersectObject(this.model, true).find((h) => vidimyy(h.object) && this.vidno(h));
      this.onVybor?.(h ? h.object.userData.chast : '');
    });
  }

  vidno(h) {
    if (this.rezhimTek === 'srez' && this.srez.distanceToPoint(h.point) < 0) return false;
    return !(this.rezhimTek === 'prozrachno' && h.object.material.transparent);
  }

  razmer() {
    const w = this.konteyner.clientWidth;
    const h = this.konteyner.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.kamera.aspect = w / h;
    this.kamera.updateProjectionMatrix();
  }
}
