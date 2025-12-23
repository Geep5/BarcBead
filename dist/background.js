// node_modules/@noble/secp256k1/index.js
var secp256k1_CURVE = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  h: 1n,
  a: 0n,
  b: 7n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
};
var { p: P, n: N, Gx, Gy, b: _b } = secp256k1_CURVE;
var L = 32;
var L2 = 64;
var lengths = {
  publicKey: L + 1,
  publicKeyUncompressed: L2 + 1,
  signature: L2,
  seed: L + L / 2
};
var captureTrace = (...args) => {
  if ("captureStackTrace" in Error && typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(...args);
  }
};
var err = (message = "") => {
  const e = new Error(message);
  captureTrace(e, err);
  throw e;
};
var isBig = (n) => typeof n === "bigint";
var isStr = (s) => typeof s === "string";
var isBytes = (a) => a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
var abytes = (value, length, title = "") => {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    err(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
};
var u8n = (len) => new Uint8Array(len);
var padh = (n, pad) => n.toString(16).padStart(pad, "0");
var bytesToHex = (b) => Array.from(abytes(b)).map((e) => padh(e, 2)).join("");
var C = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
var _ch = (ch) => {
  if (ch >= C._0 && ch <= C._9)
    return ch - C._0;
  if (ch >= C.A && ch <= C.F)
    return ch - (C.A - 10);
  if (ch >= C.a && ch <= C.f)
    return ch - (C.a - 10);
  return;
};
var hexToBytes = (hex) => {
  const e = "hex invalid";
  if (!isStr(hex))
    return err(e);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    return err(e);
  const array = u8n(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = _ch(hex.charCodeAt(hi));
    const n2 = _ch(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0)
      return err(e);
    array[ai] = n1 * 16 + n2;
  }
  return array;
};
var cr = () => globalThis?.crypto;
var subtle = () => cr()?.subtle ?? err("crypto.subtle must be defined, consider polyfill");
var concatBytes = (...arrs) => {
  const r = u8n(arrs.reduce((sum, a) => sum + abytes(a).length, 0));
  let pad = 0;
  arrs.forEach((a) => {
    r.set(a, pad);
    pad += a.length;
  });
  return r;
};
var randomBytes = (len = L) => {
  const c = cr();
  return c.getRandomValues(u8n(len));
};
var big = BigInt;
var arange = (n, min, max, msg = "bad number: out of range") => isBig(n) && min <= n && n < max ? n : err(msg);
var M = (a, b = P) => {
  const r = a % b;
  return r >= 0n ? r : b + r;
};
var modN = (a) => M(a, N);
var invert = (num, md) => {
  if (num === 0n || md <= 0n)
    err("no inverse n=" + num + " mod=" + md);
  let a = M(num, md), b = md, x = 0n, y = 1n, u = 1n, v = 0n;
  while (a !== 0n) {
    const q = b / a, r = b % a;
    const m = x - u * q, n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  return b === 1n ? M(x, md) : err("no inverse");
};
var callHash = (name) => {
  const fn = hashes[name];
  if (typeof fn !== "function")
    err("hashes." + name + " not set");
  return fn;
};
var apoint = (p) => p instanceof Point ? p : err("Point expected");
var koblitz = (x) => M(M(x * x) * x + _b);
var FpIsValid = (n) => arange(n, 0n, P);
var FpIsValidNot0 = (n) => arange(n, 1n, P);
var FnIsValidNot0 = (n) => arange(n, 1n, N);
var isEven = (y) => (y & 1n) === 0n;
var u8of = (n) => Uint8Array.of(n);
var getPrefix = (y) => u8of(isEven(y) ? 2 : 3);
var lift_x = (x) => {
  const c = koblitz(FpIsValidNot0(x));
  let r = 1n;
  for (let num = c, e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n)
      r = r * num % P;
    num = num * num % P;
  }
  return M(r * r) === c ? r : err("sqrt invalid");
};
var Point = class _Point {
  static BASE;
  static ZERO;
  X;
  Y;
  Z;
  constructor(X, Y, Z) {
    this.X = FpIsValid(X);
    this.Y = FpIsValidNot0(Y);
    this.Z = FpIsValid(Z);
    Object.freeze(this);
  }
  static CURVE() {
    return secp256k1_CURVE;
  }
  /** Create 3d xyz point from 2d xy. (0, 0) => (0, 1, 0), not (0, 0, 1) */
  static fromAffine(ap) {
    const { x, y } = ap;
    return x === 0n && y === 0n ? I : new _Point(x, y, 1n);
  }
  /** Convert Uint8Array or hex string to Point. */
  static fromBytes(bytes) {
    abytes(bytes);
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    let p = void 0;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    const x = sliceBytesNumBE(tail, 0, L);
    if (length === comp && (head === 2 || head === 3)) {
      let y = lift_x(x);
      const evenY = isEven(y);
      const evenH = isEven(big(head));
      if (evenH !== evenY)
        y = M(-y);
      p = new _Point(x, y, 1n);
    }
    if (length === uncomp && head === 4)
      p = new _Point(x, sliceBytesNumBE(tail, L, L2), 1n);
    return p ? p.assertValidity() : err("bad point: not on curve");
  }
  static fromHex(hex) {
    return _Point.fromBytes(hexToBytes(hex));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  /** Equality check: compare points P&Q. */
  equals(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    const X1Z2 = M(X1 * Z2);
    const X2Z1 = M(X2 * Z1);
    const Y1Z2 = M(Y1 * Z2);
    const Y2Z1 = M(Y2 * Z1);
    return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
  }
  is0() {
    return this.equals(I);
  }
  /** Flip point over y coordinate. */
  negate() {
    return new _Point(this.X, M(-this.Y), this.Z);
  }
  /** Point doubling: P+P, complete formula. */
  double() {
    return this.add(this);
  }
  /**
   * Point addition: P+Q, complete, exception-free formula
   * (Renes-Costello-Batina, algo 1 of [2015/1060](https://eprint.iacr.org/2015/1060)).
   * Cost: `12M + 0S + 3*a + 3*b3 + 23add`.
   */
  // prettier-ignore
  add(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    const a = 0n;
    const b = _b;
    let X3 = 0n, Y3 = 0n, Z3 = 0n;
    const b3 = M(b * 3n);
    let t0 = M(X1 * X2), t1 = M(Y1 * Y2), t2 = M(Z1 * Z2), t3 = M(X1 + Y1);
    let t4 = M(X2 + Y2);
    t3 = M(t3 * t4);
    t4 = M(t0 + t1);
    t3 = M(t3 - t4);
    t4 = M(X1 + Z1);
    let t5 = M(X2 + Z2);
    t4 = M(t4 * t5);
    t5 = M(t0 + t2);
    t4 = M(t4 - t5);
    t5 = M(Y1 + Z1);
    X3 = M(Y2 + Z2);
    t5 = M(t5 * X3);
    X3 = M(t1 + t2);
    t5 = M(t5 - X3);
    Z3 = M(a * t4);
    X3 = M(b3 * t2);
    Z3 = M(X3 + Z3);
    X3 = M(t1 - Z3);
    Z3 = M(t1 + Z3);
    Y3 = M(X3 * Z3);
    t1 = M(t0 + t0);
    t1 = M(t1 + t0);
    t2 = M(a * t2);
    t4 = M(b3 * t4);
    t1 = M(t1 + t2);
    t2 = M(t0 - t2);
    t2 = M(a * t2);
    t4 = M(t4 + t2);
    t0 = M(t1 * t4);
    Y3 = M(Y3 + t0);
    t0 = M(t5 * t4);
    X3 = M(t3 * X3);
    X3 = M(X3 - t0);
    t0 = M(t3 * t1);
    Z3 = M(t5 * Z3);
    Z3 = M(Z3 + t0);
    return new _Point(X3, Y3, Z3);
  }
  subtract(other) {
    return this.add(apoint(other).negate());
  }
  /**
   * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
   * Uses {@link wNAF} for base point.
   * Uses fake point to mitigate side-channel leakage.
   * @param n scalar by which point is multiplied
   * @param safe safe mode guards against timing attacks; unsafe mode is faster
   */
  multiply(n, safe = true) {
    if (!safe && n === 0n)
      return I;
    FnIsValidNot0(n);
    if (n === 1n)
      return this;
    if (this.equals(G))
      return wNAF(n).p;
    let p = I;
    let f = G;
    for (let d = this; n > 0n; d = d.double(), n >>= 1n) {
      if (n & 1n)
        p = p.add(d);
      else if (safe)
        f = f.add(d);
    }
    return p;
  }
  multiplyUnsafe(scalar) {
    return this.multiply(scalar, false);
  }
  /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
  toAffine() {
    const { X: x, Y: y, Z: z } = this;
    if (this.equals(I))
      return { x: 0n, y: 0n };
    if (z === 1n)
      return { x, y };
    const iz = invert(z, P);
    if (M(z * iz) !== 1n)
      err("inverse invalid");
    return { x: M(x * iz), y: M(y * iz) };
  }
  /** Checks if the point is valid and on-curve. */
  assertValidity() {
    const { x, y } = this.toAffine();
    FpIsValidNot0(x);
    FpIsValidNot0(y);
    return M(y * y) === koblitz(x) ? this : err("bad point: not on curve");
  }
  /** Converts point to 33/65-byte Uint8Array. */
  toBytes(isCompressed = true) {
    const { x, y } = this.assertValidity().toAffine();
    const x32b = numTo32b(x);
    if (isCompressed)
      return concatBytes(getPrefix(y), x32b);
    return concatBytes(u8of(4), x32b, numTo32b(y));
  }
  toHex(isCompressed) {
    return bytesToHex(this.toBytes(isCompressed));
  }
};
var G = new Point(Gx, Gy, 1n);
var I = new Point(0n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
var doubleScalarMulUns = (R, u1, u2) => {
  return G.multiply(u1, false).add(R.multiply(u2, false)).assertValidity();
};
var bytesToNumBE = (b) => big("0x" + (bytesToHex(b) || "0"));
var sliceBytesNumBE = (b, from, to) => bytesToNumBE(b.subarray(from, to));
var B256 = 2n ** 256n;
var numTo32b = (num) => hexToBytes(padh(arange(num, 0n, B256), L2));
var secretKeyToScalar = (secretKey) => {
  const num = bytesToNumBE(abytes(secretKey, L, "secret key"));
  return arange(num, 1n, N, "invalid secret key: outside of range");
};
var getPublicKey = (privKey, isCompressed = true) => {
  return G.multiply(secretKeyToScalar(privKey)).toBytes(isCompressed);
};
var _sha = "SHA-256";
var hashes = {
  hmacSha256Async: async (key, message) => {
    const s = subtle();
    const name = "HMAC";
    const k = await s.importKey("raw", key, { name, hash: { name: _sha } }, false, ["sign"]);
    return u8n(await s.sign(name, k, message));
  },
  hmacSha256: void 0,
  sha256Async: async (msg) => u8n(await subtle().digest(_sha, msg)),
  sha256: void 0
};
var NULL = u8n(0);
var byte0 = u8of(0);
var byte1 = u8of(1);
var getSharedSecret = (secretKeyA, publicKeyB, isCompressed = true) => {
  return Point.fromBytes(publicKeyB).multiply(secretKeyToScalar(secretKeyA)).toBytes(isCompressed);
};
var randomSecretKey = (seed = randomBytes(lengths.seed)) => {
  abytes(seed);
  if (seed.length < lengths.seed || seed.length > 1024)
    err("expected 40-1024b");
  const num = M(bytesToNumBE(seed), N - 1n);
  return numTo32b(num + 1n);
};
var createKeygen = (getPublicKey3) => (seed) => {
  const secretKey = randomSecretKey(seed);
  return { secretKey, publicKey: getPublicKey3(secretKey) };
};
var keygen = createKeygen(getPublicKey);
var etc = {
  hexToBytes,
  bytesToHex,
  concatBytes,
  bytesToNumberBE: bytesToNumBE,
  numberToBytesBE: numTo32b,
  mod: M,
  invert,
  // math utilities
  randomBytes,
  secretKeyToScalar,
  abytes
};
var getTag = (tag) => Uint8Array.from("BIP0340/" + tag, (c) => c.charCodeAt(0));
var T_AUX = "aux";
var T_NONCE = "nonce";
var T_CHALLENGE = "challenge";
var taggedHash = (tag, ...messages) => {
  const fn = callHash("sha256");
  const tagH = fn(getTag(tag));
  return fn(concatBytes(tagH, tagH, ...messages));
};
var taggedHashAsync = async (tag, ...messages) => {
  const fn = hashes.sha256Async;
  const tagH = await fn(getTag(tag));
  return await fn(concatBytes(tagH, tagH, ...messages));
};
var extpubSchnorr = (priv) => {
  const d_ = secretKeyToScalar(priv);
  const p = G.multiply(d_);
  const { x, y } = p.assertValidity().toAffine();
  const d = isEven(y) ? d_ : modN(-d_);
  const px = numTo32b(x);
  return { d, px };
};
var bytesModN = (bytes) => modN(bytesToNumBE(bytes));
var challenge = (...args) => bytesModN(taggedHash(T_CHALLENGE, ...args));
var challengeAsync = async (...args) => bytesModN(await taggedHashAsync(T_CHALLENGE, ...args));
var pubSchnorr = (secretKey) => {
  return extpubSchnorr(secretKey).px;
};
var keygenSchnorr = createKeygen(pubSchnorr);
var prepSigSchnorr = (message, secretKey, auxRand) => {
  const { px, d } = extpubSchnorr(secretKey);
  return { m: abytes(message), px, d, a: abytes(auxRand, L) };
};
var extractK = (rand) => {
  const k_ = bytesModN(rand);
  if (k_ === 0n)
    err("sign failed: k is zero");
  const { px, d } = extpubSchnorr(numTo32b(k_));
  return { rx: px, k: d };
};
var createSigSchnorr = (k, px, e, d) => {
  return concatBytes(px, numTo32b(modN(k + e * d)));
};
var E_INVSIG = "invalid signature produced";
var signSchnorr = (message, secretKey, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey, auxRand);
  const aux = taggedHash(T_AUX, a);
  const t = numTo32b(d ^ bytesToNumBE(aux));
  const rand = taggedHash(T_NONCE, t, px, m);
  const { rx, k } = extractK(rand);
  const e = challenge(rx, px, m);
  const sig = createSigSchnorr(k, rx, e, d);
  if (!verifySchnorr(sig, m, px))
    err(E_INVSIG);
  return sig;
};
var signSchnorrAsync = async (message, secretKey, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey, auxRand);
  const aux = await taggedHashAsync(T_AUX, a);
  const t = numTo32b(d ^ bytesToNumBE(aux));
  const rand = await taggedHashAsync(T_NONCE, t, px, m);
  const { rx, k } = extractK(rand);
  const e = await challengeAsync(rx, px, m);
  const sig = createSigSchnorr(k, rx, e, d);
  if (!await verifySchnorrAsync(sig, m, px))
    err(E_INVSIG);
  return sig;
};
var callSyncAsyncFn = (res, later) => {
  return res instanceof Promise ? res.then(later) : later(res);
};
var _verifSchnorr = (signature, message, publicKey, challengeFn) => {
  const sig = abytes(signature, L2, "signature");
  const msg = abytes(message, void 0, "message");
  const pub = abytes(publicKey, L, "publicKey");
  try {
    const x = bytesToNumBE(pub);
    const y = lift_x(x);
    const y_ = isEven(y) ? y : M(-y);
    const P_ = new Point(x, y_, 1n).assertValidity();
    const px = numTo32b(P_.toAffine().x);
    const r = sliceBytesNumBE(sig, 0, L);
    arange(r, 1n, P);
    const s = sliceBytesNumBE(sig, L, L2);
    arange(s, 1n, N);
    const i = concatBytes(numTo32b(r), px, msg);
    return callSyncAsyncFn(challengeFn(i), (e) => {
      const { x: x2, y: y2 } = doubleScalarMulUns(P_, s, modN(-e)).toAffine();
      if (!isEven(y2) || x2 !== r)
        return false;
      return true;
    });
  } catch (error) {
    return false;
  }
};
var verifySchnorr = (s, m, p) => _verifSchnorr(s, m, p, challenge);
var verifySchnorrAsync = async (s, m, p) => _verifSchnorr(s, m, p, challengeAsync);
var schnorr = {
  keygen: keygenSchnorr,
  getPublicKey: pubSchnorr,
  sign: signSchnorr,
  verify: verifySchnorr,
  signAsync: signSchnorrAsync,
  verifyAsync: verifySchnorrAsync
};
var W = 8;
var scalarBits = 256;
var pwindows = Math.ceil(scalarBits / W) + 1;
var pwindowSize = 2 ** (W - 1);
var precompute = () => {
  const points = [];
  let p = G;
  let b = p;
  for (let w = 0; w < pwindows; w++) {
    b = p;
    points.push(b);
    for (let i = 1; i < pwindowSize; i++) {
      b = b.add(p);
      points.push(b);
    }
    p = b.double();
  }
  return points;
};
var Gpows = void 0;
var ctneg = (cnd, p) => {
  const n = p.negate();
  return cnd ? n : p;
};
var wNAF = (n) => {
  const comp = Gpows || (Gpows = precompute());
  let p = I;
  let f = G;
  const pow_2_w = 2 ** W;
  const maxNum = pow_2_w;
  const mask = big(pow_2_w - 1);
  const shiftBy = big(W);
  for (let w = 0; w < pwindows; w++) {
    let wbits = Number(n & mask);
    n >>= shiftBy;
    if (wbits > pwindowSize) {
      wbits -= maxNum;
      n += 1n;
    }
    const off = w * pwindowSize;
    const offF = off;
    const offP = off + Math.abs(wbits) - 1;
    const isEven2 = w % 2 !== 0;
    const isNeg = wbits < 0;
    if (wbits === 0) {
      f = f.add(ctneg(isEven2, comp[offF]));
    } else {
      p = p.add(ctneg(isNeg, comp[offP]));
    }
  }
  if (n !== 0n)
    err("invalid wnaf");
  return { p, f };
};

// node_modules/@noble/hashes/esm/crypto.js
var crypto2 = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;

// node_modules/@noble/hashes/esm/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes2(b, ...lengths2) {
  if (!isBytes2(b))
    throw new Error("Uint8Array expected");
  if (lengths2.length > 0 && !lengths2.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths2 + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes2(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex2(bytes) {
  abytes2(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes2(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes2(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes2(bytesLength = 32) {
  if (crypto2 && typeof crypto2.getRandomValues === "function") {
    return crypto2.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto2 && typeof crypto2.randomBytes === "function") {
    return Uint8Array.from(crypto2.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes2(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C: C2, D, E, F, G: G2, H } = this;
    return [A, B, C2, D, E, F, G2, H];
  }
  // prettier-ignore
  set(A, B, C2, D, E, F, G2, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C2 | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G2 | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C: C2, D, E, F, G: G2, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G2) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C2) | 0;
      H = G2;
      G2 = F;
      F = E;
      E = D + T1 | 0;
      D = C2;
      C2 = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C2 = C2 + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G2 = G2 + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C2, D, E, F, G2, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// node_modules/@noble/hashes/esm/hmac.js
var HMAC = class extends Hash {
  constructor(hash, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    ahash(hash);
    const key = toBytes(_key);
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes2(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);

// src/lib/nostr.js
etc.hmacSha256Sync = (k, ...m) => hmac(sha2562, k, etc.concatBytes(...m));
etc.sha256Sync = (...m) => sha2562(etc.concatBytes(...m));
if (hashes) {
  hashes.sha256 = sha2562;
  hashes.hmacSha256 = (key, msg) => hmac(sha2562, key, msg);
}
var DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net"
];
function generatePrivateKey() {
  return bytesToHex2(randomBytes2(32));
}
function getPublicKey2(privateKeyHex) {
  const privateKeyBytes = hexToBytes2(privateKeyHex);
  const pubkeyBytes = getPublicKey(privateKeyBytes, true);
  return bytesToHex2(pubkeyBytes.slice(1));
}
async function sha256Hex(message) {
  const msgBytes = new TextEncoder().encode(message);
  return bytesToHex2(sha2562(msgBytes));
}
async function createEvent(privateKey, kind, content, tags = []) {
  const pubkey = getPublicKey2(privateKey);
  const created_at = Math.floor(Date.now() / 1e3);
  const eventData = [0, pubkey, created_at, kind, tags, content];
  const serialized = JSON.stringify(eventData);
  const id = await sha256Hex(serialized);
  const sig = await schnorr.sign(hexToBytes2(id), hexToBytes2(privateKey));
  const event = {
    id,
    pubkey,
    created_at,
    kind,
    tags,
    content,
    sig: bytesToHex2(sig)
  };
  const isValid = await schnorr.verify(sig, hexToBytes2(id), hexToBytes2(pubkey));
  if (!isValid) {
    console.error("Self-verification failed! Event:", event);
  }
  return event;
}
async function nip04Encrypt(privateKeyHex, recipientPubKeyHex, plaintext) {
  const recipientPubkeyFull = "02" + recipientPubKeyHex;
  const sharedPoint = getSharedSecret(privateKeyHex, recipientPubkeyFull);
  const sharedSecret = sharedPoint.slice(1, 33);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    plaintextBytes
  );
  const ciphertextB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  const ivB64 = btoa(String.fromCharCode(...iv));
  return `${ciphertextB64}?iv=${ivB64}`;
}
async function nip04Decrypt(privateKeyHex, senderPubKeyHex, encryptedContent) {
  const senderPubkeyFull = "02" + senderPubKeyHex;
  const sharedPoint = getSharedSecret(privateKeyHex, senderPubkeyFull);
  const sharedSecret = sharedPoint.slice(1, 33);
  const [ciphertextB64, ivPart] = encryptedContent.split("?iv=");
  if (!ivPart) throw new Error("Invalid NIP-04 format");
  const ciphertext = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivPart), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintextBytes);
}
async function urlToChannelId(url) {
  try {
    const parsed = new URL(url);
    const normalized = parsed.origin + parsed.pathname.replace(/\/$/, "");
    return await sha256Hex(normalized);
  } catch {
    return await sha256Hex(url);
  }
}
var NostrRelay = class {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.subscriptions = /* @__PURE__ */ new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventCallbacks = /* @__PURE__ */ new Map();
    this.eoseCallbacks = /* @__PURE__ */ new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.connected) {
          console.warn(`Connection timeout for relay: ${this.url}`);
          reject(new Error("Connection timeout"));
        }
      }, 5e3);
      try {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`Connected to relay: ${this.url}`);
          resolve();
        };
        this.ws.onclose = () => {
          clearTimeout(timeout);
          this.connected = false;
          console.log(`Disconnected from relay: ${this.url}`);
          this.attemptReconnect();
        };
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`Relay error (${this.url}):`, error);
          reject(error);
        };
        this.ws.onmessage = (msg) => {
          this.handleMessage(msg.data);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect().catch(() => {
      }), 2e3 * this.reconnectAttempts);
    }
  }
  handleMessage(data) {
    try {
      const msg = JSON.parse(data);
      const [type, ...rest] = msg;
      if (type === "EVENT") {
        const [subId, event] = rest;
        const callback = this.eventCallbacks.get(subId);
        if (callback) {
          callback(event);
        }
      } else if (type === "EOSE") {
        const [subId] = rest;
        const eoseCallback = this.eoseCallbacks.get(subId);
        if (eoseCallback) {
          eoseCallback();
          this.eoseCallbacks.delete(subId);
        }
      } else if (type === "OK") {
        const [eventId, success, message] = rest;
        console.log(`[${this.url}] Event ${eventId.slice(0, 8)}: ${success ? "published" : "REJECTED"} - ${message || ""}`);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }
  subscribe(subId, filters, callback, onEose = null) {
    if (!this.connected) return;
    this.eventCallbacks.set(subId, callback);
    if (onEose) {
      this.eoseCallbacks.set(subId, onEose);
    }
    const msg = JSON.stringify(["REQ", subId, ...filters]);
    this.ws.send(msg);
    this.subscriptions.set(subId, filters);
  }
  unsubscribe(subId) {
    if (!this.connected) return;
    this.eventCallbacks.delete(subId);
    this.subscriptions.delete(subId);
    const msg = JSON.stringify(["CLOSE", subId]);
    this.ws.send(msg);
  }
  publish(event) {
    if (!this.connected) return false;
    const msg = JSON.stringify(["EVENT", event]);
    this.ws.send(msg);
    return true;
  }
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
};
var BarcNostrClient = class {
  constructor() {
    this.relays = [];
    this.privateKey = null;
    this.publicKey = null;
    this.currentChannelId = null;
    this.currentUrl = null;
    this.messageCallback = null;
    this.presenceCallback = null;
    this.globalActivityCallback = null;
    this.dmCallback = null;
    this.users = /* @__PURE__ */ new Map();
    this.dmConversations = /* @__PURE__ */ new Map();
    this.globalActivity = /* @__PURE__ */ new Map();
    this.seenMessageIds = /* @__PURE__ */ new Set();
    this.pendingMessages = [];
  }
  async init(savedPrivateKey = null) {
    if (savedPrivateKey) {
      this.privateKey = savedPrivateKey;
    } else {
      this.privateKey = generatePrivateKey();
    }
    this.publicKey = getPublicKey2(this.privateKey);
    const connectionPromises = DEFAULT_RELAYS.map(async (url) => {
      const relay = new NostrRelay(url);
      try {
        await relay.connect();
        this.relays.push(relay);
        console.log(`Successfully connected to ${url}`);
        return true;
      } catch (error) {
        console.warn(`Failed to connect to ${url}:`, error);
        return false;
      }
    });
    await Promise.allSettled(connectionPromises);
    console.log(`Connected to ${this.relays.filter((r) => r.connected).length}/${DEFAULT_RELAYS.length} relays`);
    this.subscribeToGlobalActivity();
    this.subscribeToDMs();
    return { privateKey: this.privateKey, publicKey: this.publicKey };
  }
  subscribeToDMs() {
    const filters = [
      {
        kinds: [4],
        "#p": [this.publicKey],
        since: Math.floor(Date.now() / 1e3) - 86400
      },
      {
        kinds: [4],
        authors: [this.publicKey],
        since: Math.floor(Date.now() / 1e3) - 86400
      }
    ];
    for (const relay of this.relays) {
      relay.subscribe("barc-dms", filters, (event) => {
        this.handleDMEvent(event);
      });
    }
  }
  async handleDMEvent(event) {
    if (event.kind !== 4) return;
    const isFromMe = event.pubkey === this.publicKey;
    let otherPubkey;
    if (isFromMe) {
      const pTag = event.tags.find((t) => t[0] === "p");
      if (!pTag) return;
      otherPubkey = pTag[1];
    } else {
      otherPubkey = event.pubkey;
    }
    let plaintext;
    try {
      plaintext = await nip04Decrypt(this.privateKey, otherPubkey, event.content);
    } catch (error) {
      console.error("Failed to decrypt DM:", error);
      return;
    }
    const dm = {
      id: event.id,
      pubkey: event.pubkey,
      otherPubkey,
      content: plaintext,
      timestamp: event.created_at * 1e3,
      isOwn: isFromMe
    };
    if (!this.dmConversations.has(otherPubkey)) {
      this.dmConversations.set(otherPubkey, []);
    }
    const conversation = this.dmConversations.get(otherPubkey);
    if (!conversation.find((m) => m.id === dm.id)) {
      conversation.push(dm);
      conversation.sort((a, b) => a.timestamp - b.timestamp);
      if (this.dmCallback) {
        this.dmCallback(dm, otherPubkey);
      }
    }
  }
  async sendDM(recipientPubkey, plaintext) {
    if (!plaintext.trim()) return null;
    const encryptedContent = await nip04Encrypt(this.privateKey, recipientPubkey, plaintext);
    const event = await createEvent(
      this.privateKey,
      4,
      encryptedContent,
      [["p", recipientPubkey]]
    );
    let published = false;
    for (const relay of this.relays) {
      if (relay.publish(event)) {
        published = true;
      }
    }
    if (!published) {
      console.error("sendDM: Failed to publish to any relay");
      return null;
    }
    const dm = {
      id: event.id,
      pubkey: this.publicKey,
      otherPubkey: recipientPubkey,
      content: plaintext,
      timestamp: event.created_at * 1e3,
      isOwn: true
    };
    if (!this.dmConversations.has(recipientPubkey)) {
      this.dmConversations.set(recipientPubkey, []);
    }
    this.dmConversations.get(recipientPubkey).push(dm);
    if (this.dmCallback) {
      this.dmCallback(dm, recipientPubkey);
    }
    return event;
  }
  getDMConversation(pubkey) {
    return this.dmConversations.get(pubkey) || [];
  }
  getDMConversations() {
    const conversations = [];
    for (const [pubkey, messages] of this.dmConversations) {
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        conversations.push({
          pubkey,
          name: this.getUserName(pubkey),
          lastMessage: lastMessage.content,
          timestamp: lastMessage.timestamp,
          unread: messages.filter((m) => !m.isOwn && !m.read).length
        });
      }
    }
    return conversations.sort((a, b) => b.timestamp - a.timestamp);
  }
  onDM(callback) {
    this.dmCallback = callback;
  }
  subscribeToGlobalActivity() {
    const filters = [
      {
        kinds: [10042],
        since: Math.floor(Date.now() / 1e3) - 300
      }
    ];
    for (const relay of this.relays) {
      relay.subscribe("barc-global", filters, (event) => {
        this.handleGlobalPresence(event);
      });
    }
  }
  handleGlobalPresence(event) {
    try {
      const data = JSON.parse(event.content);
      const url = data.url;
      if (!url) return;
      if (!this.globalActivity.has(url)) {
        this.globalActivity.set(url, { users: /* @__PURE__ */ new Map(), lastUpdate: 0 });
      }
      const activity = this.globalActivity.get(url);
      activity.users.set(event.pubkey, {
        name: data.name || event.pubkey.slice(0, 8),
        lastSeen: event.created_at * 1e3
      });
      activity.lastUpdate = Date.now();
      if (this.globalActivityCallback) {
        this.globalActivityCallback(this.getGlobalActivity());
      }
    } catch {
    }
  }
  getGlobalActivity() {
    const now = Date.now();
    const active = [];
    for (const [url, activity] of this.globalActivity) {
      let activeCount = 0;
      const activeUsers = [];
      for (const [pubkey, data] of activity.users) {
        if (now - data.lastSeen < 3e5) {
          activeCount++;
          activeUsers.push({
            pubkey,
            name: data.name,
            isYou: pubkey === this.publicKey
          });
        }
      }
      if (activeCount > 0) {
        active.push({
          url,
          userCount: activeCount,
          users: activeUsers,
          isCurrentPage: url === this.currentUrl
        });
      }
    }
    active.sort((a, b) => b.userCount - a.userCount);
    return active;
  }
  onGlobalActivity(callback) {
    this.globalActivityCallback = callback;
  }
  async joinChannel(url) {
    this.currentUrl = url;
    this.currentChannelId = await urlToChannelId(url);
    this.pendingMessages = [];
    this.seenMessageIds.clear();
    console.log("Joining channel:", this.currentChannelId, "for URL:", url);
    const oneWeekAgo = Math.floor(Date.now() / 1e3) - 7 * 24 * 60 * 60;
    const filters = [
      {
        kinds: [42],
        "#d": [this.currentChannelId],
        since: oneWeekAgo,
        limit: 10
      },
      {
        kinds: [10042],
        "#d": [this.currentChannelId],
        since: Math.floor(Date.now() / 1e3) - 300
      }
    ];
    console.log("Subscribing with filters:", JSON.stringify(filters));
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      return { channelId: this.currentChannelId, messages: [] };
    }
    const eosePromise = new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 3e3);
      for (const relay of connectedRelays) {
        relay.subscribe(`barc-${this.currentChannelId}`, filters, (event) => {
          this.handleEvent(event, true);
        }, () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });
    await eosePromise;
    this.pendingMessages.sort((a, b) => a.timestamp - b.timestamp);
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    console.log("joinChannel: Got", messages.length, "messages after EOSE");
    await this.announcePresence();
    return { channelId: this.currentChannelId, messages };
  }
  leaveChannel() {
    if (this.currentChannelId) {
      for (const relay of this.relays) {
        relay.unsubscribe(`barc-${this.currentChannelId}`);
      }
      this.currentChannelId = null;
      this.users.clear();
    }
  }
  async fetchMessages(url, since = null, until = null, limit = 10) {
    const channelId = await urlToChannelId(url);
    const collectedMessages = [];
    const seenIds = /* @__PURE__ */ new Set();
    const defaultSince = Math.floor(Date.now() / 1e3) - 30 * 24 * 60 * 60;
    const filter = {
      kinds: [42],
      "#d": [channelId],
      since: since || defaultSince,
      limit
    };
    if (until) {
      filter.until = until;
    }
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }
    console.log("Fetching messages with filter:", filter);
    const subId = `search-${Date.now()}`;
    const eosePromise = new Promise((resolve) => {
      let eoseCount = 0;
      const timeout = setTimeout(() => {
        console.log("Search timeout reached");
        resolve();
      }, 5e3);
      for (const relay of connectedRelays) {
        relay.subscribe(subId, [filter], (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            const userName2 = this.getUserName(event.pubkey);
            collectedMessages.push({
              id: event.id,
              pubkey: event.pubkey,
              name: userName2,
              content: event.content,
              timestamp: event.created_at * 1e3,
              isOwn: event.pubkey === this.publicKey
            });
          }
        }, () => {
          eoseCount++;
          console.log(`EOSE from relay ${eoseCount}/${connectedRelays.length}`);
          if (eoseCount >= connectedRelays.length) {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });
    await eosePromise;
    for (const relay of connectedRelays) {
      relay.unsubscribe(subId);
    }
    collectedMessages.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`Found ${collectedMessages.length} messages`);
    return collectedMessages;
  }
  handleEvent(event, collecting = false) {
    console.log("handleEvent received:", event.kind, event.id?.slice(0, 8), "collecting:", collecting);
    if (event.kind === 42) {
      if (this.seenMessageIds.has(event.id)) return;
      this.seenMessageIds.add(event.id);
      const userName2 = this.getUserName(event.pubkey);
      const message = {
        id: event.id,
        pubkey: event.pubkey,
        name: userName2,
        content: event.content,
        timestamp: event.created_at * 1e3,
        isOwn: event.pubkey === this.publicKey
      };
      if (collecting) {
        this.pendingMessages.push(message);
      } else if (this.messageCallback) {
        this.messageCallback(message);
      }
    } else if (event.kind === 10042) {
      try {
        const data = JSON.parse(event.content);
        this.users.set(event.pubkey, {
          name: data.name || event.pubkey.slice(0, 8),
          lastSeen: event.created_at * 1e3
        });
        if (this.presenceCallback) {
          this.presenceCallback(this.getActiveUsers());
        }
      } catch {
      }
    }
  }
  getUserName(pubkey) {
    const user = this.users.get(pubkey);
    return user?.name || pubkey.slice(0, 8);
  }
  getActiveUsers() {
    const now = Date.now();
    const active = [];
    for (const [pubkey, data] of this.users) {
      if (now - data.lastSeen < 3e5) {
        active.push({
          pubkey,
          name: data.name,
          isYou: pubkey === this.publicKey
        });
      }
    }
    return active;
  }
  async announcePresence(name = null) {
    if (!this.currentChannelId || !this.publicKey) return;
    const displayName = name || `User-${this.publicKey.slice(0, 6)}`;
    const content = JSON.stringify({
      name: displayName,
      url: this.currentUrl,
      action: "join"
    });
    const event = await createEvent(
      this.privateKey,
      10042,
      content,
      [["d", this.currentChannelId]]
    );
    for (const relay of this.relays) {
      relay.publish(event);
    }
    this.users.set(this.publicKey, {
      name: displayName,
      lastSeen: Date.now()
    });
    if (this.currentUrl) {
      if (!this.globalActivity.has(this.currentUrl)) {
        this.globalActivity.set(this.currentUrl, { users: /* @__PURE__ */ new Map(), lastUpdate: 0 });
      }
      const activity = this.globalActivity.get(this.currentUrl);
      activity.users.set(this.publicKey, {
        name: displayName,
        lastSeen: Date.now()
      });
    }
  }
  async sendMessage(content, url = null) {
    const channelId = url ? await urlToChannelId(url) : this.currentChannelId;
    console.log("sendMessage: url=", url, "channelId=", channelId, "currentChannelId=", this.currentChannelId);
    if (!channelId || !content.trim()) {
      console.error("sendMessage: No channel or empty content");
      return null;
    }
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      console.error("sendMessage: No relays connected");
      return null;
    }
    const event = await createEvent(
      this.privateKey,
      42,
      content,
      [["d", channelId]]
    );
    let published = false;
    for (const relay of connectedRelays) {
      if (relay.publish(event)) {
        published = true;
      }
    }
    if (!published) {
      console.error("sendMessage: Failed to publish to any relay");
      return null;
    }
    if (this.messageCallback) {
      this.messageCallback({
        id: event.id,
        pubkey: event.pubkey,
        name: this.getUserName(event.pubkey),
        content: event.content,
        timestamp: event.created_at * 1e3,
        isOwn: true
      });
    }
    return event;
  }
  onMessage(callback) {
    this.messageCallback = callback;
  }
  onPresence(callback) {
    this.presenceCallback = callback;
  }
  // Post to someone's wall (HomeScreen) - uses p-tag to reference the wall owner
  // This is a bare-bones post to a pubkey address
  async postToWall(targetPubkey, content) {
    if (!content.trim()) {
      console.error("postToWall: Empty content");
      return null;
    }
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      console.error("postToWall: No relays connected");
      return null;
    }
    const event = await createEvent(
      this.privateKey,
      1,
      // Standard text note
      content,
      [
        ["p", targetPubkey],
        // Reference to whose wall this is on
        ["barc-wall", targetPubkey]
        // Custom tag to identify wall posts
      ]
    );
    let published = false;
    for (const relay of connectedRelays) {
      if (relay.publish(event)) {
        published = true;
      }
    }
    if (!published) {
      console.error("postToWall: Failed to publish to any relay");
      return null;
    }
    return event;
  }
  // Fetch posts that mention/tag a pubkey (from other users)
  async fetchMentions(targetPubkey, limit = 50) {
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }
    const posts = [];
    const seenIds = /* @__PURE__ */ new Set();
    const filter = {
      kinds: [1, 6, 7, 9735],
      "#p": [targetPubkey],
      limit
    };
    const fetchPromises = connectedRelays.map((relay) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 5e3);
        relay.subscribe(filter, (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            posts.push(this.parseEventToPost(event));
          }
        }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });
    await Promise.all(fetchPromises);
    posts.sort((a, b) => b.timestamp - a.timestamp);
    return posts;
  }
  // Fetch posts authored by a pubkey (their own posts)
  async fetchUserPosts(targetPubkey, limit = 50) {
    const connectedRelays = this.relays.filter((r) => r.connected);
    if (connectedRelays.length === 0) {
      return [];
    }
    const posts = [];
    const seenIds = /* @__PURE__ */ new Set();
    const filter = {
      kinds: [1, 6, 30023],
      authors: [targetPubkey],
      limit
    };
    const fetchPromises = connectedRelays.map((relay) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 5e3);
        relay.subscribe(filter, (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            posts.push(this.parseEventToPost(event));
          }
        }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });
    await Promise.all(fetchPromises);
    posts.sort((a, b) => b.timestamp - a.timestamp);
    return posts;
  }
  // Parse a raw Nostr event into a structured post object
  parseEventToPost(event) {
    const post = {
      id: event.id,
      pubkey: event.pubkey,
      name: this.getUserName(event.pubkey),
      content: event.content,
      timestamp: event.created_at * 1e3,
      kind: event.kind,
      kindLabel: this.getKindLabel(event.kind),
      tags: event.tags,
      isOwn: event.pubkey === this.publicKey,
      images: [],
      links: [],
      mentionedPubkeys: []
    };
    const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))/gi;
    const imageMatches = event.content.match(imageRegex);
    if (imageMatches) {
      post.images = [...new Set(imageMatches)];
    }
    const linkRegex = /(https?:\/\/[^\s]+)/gi;
    const linkMatches = event.content.match(linkRegex);
    if (linkMatches) {
      post.links = [...new Set(linkMatches)].filter((l) => !post.images.includes(l));
    }
    for (const tag of event.tags) {
      if (tag[0] === "p" && tag[1]) {
        post.mentionedPubkeys.push(tag[1]);
      }
    }
    if (event.kind === 6 && event.content) {
      try {
        const originalEvent = JSON.parse(event.content);
        post.repostedEvent = this.parseEventToPost(originalEvent);
      } catch {
      }
    }
    if (event.kind === 7) {
      post.reaction = event.content || "+";
      for (const tag of event.tags) {
        if (tag[0] === "e" && tag[1]) {
          post.reactedToEventId = tag[1];
          break;
        }
      }
    }
    if (event.kind === 9735) {
      for (const tag of event.tags) {
        if (tag[0] === "bolt11" && tag[1]) {
          post.zapInvoice = tag[1];
        }
        if (tag[0] === "description" && tag[1]) {
          try {
            const zapRequest = JSON.parse(tag[1]);
            post.zapMessage = zapRequest.content;
          } catch {
          }
        }
      }
    }
    return post;
  }
  // Get human-readable label for event kind
  getKindLabel(kind) {
    const kinds = {
      1: "note",
      6: "repost",
      7: "reaction",
      9735: "zap",
      30023: "article"
    };
    return kinds[kind] || `kind ${kind}`;
  }
  // Keep old method for backwards compatibility
  async fetchWallPosts(targetPubkey, limit = 50) {
    return this.fetchMentions(targetPubkey, limit);
  }
  disconnect() {
    this.leaveChannel();
    for (const relay of this.relays) {
      relay.close();
    }
    this.relays = [];
  }
};

// src/background.js
var nostrClient = null;
var currentChannelUrl = null;
var userName = null;
var unreadCount = 0;
var dashboardOpen = false;
var BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Decode(str) {
  str = str.toLowerCase();
  const sepIndex = str.lastIndexOf("1");
  if (sepIndex < 1) return null;
  const hrp = str.slice(0, sepIndex);
  const data = str.slice(sepIndex + 1);
  const values = [];
  for (const char of data) {
    const idx = BECH32_ALPHABET.indexOf(char);
    if (idx === -1) return null;
    values.push(idx);
  }
  const payload = values.slice(0, -6);
  let acc = 0;
  let bits = 0;
  const result = [];
  for (const value of payload) {
    acc = acc << 5 | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push(acc >> bits & 255);
    }
  }
  return { hrp, bytes: new Uint8Array(result) };
}
function bytesToHex3(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parsePrivateKey(input) {
  input = input.trim();
  if (input.startsWith("nsec1")) {
    const decoded = bech32Decode(input);
    if (!decoded || decoded.hrp !== "nsec" || decoded.bytes.length !== 32) {
      return { error: "Invalid nsec key format" };
    }
    return { privateKey: bytesToHex3(decoded.bytes) };
  }
  if (/^[a-fA-F0-9]{64}$/.test(input)) {
    return { privateKey: input.toLowerCase() };
  }
  return { error: "Invalid key format. Use nsec1... or 64-char hex." };
}
function updateBadge() {
  if (unreadCount > 0) {
    chrome.action.setBadgeText({ text: unreadCount > 99 ? "99+" : unreadCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#e94560" });
  } else {
    const userCount = nostrClient?.getActiveUsers()?.length || 0;
    if (userCount > 0) {
      chrome.action.setBadgeText({ text: userCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#4ade80" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  }
}
function clearUnread() {
  unreadCount = 0;
  updateBadge();
}
async function initClient(privateKey = null) {
  if (nostrClient && nostrClient.publicKey && !privateKey) return nostrClient;
  if (nostrClient && privateKey) {
    nostrClient.disconnect();
    nostrClient = null;
  }
  const stored = await chrome.storage.local.get(["privateKey", "userName"]);
  userName = stored.userName || null;
  const keyToUse = privateKey || stored.privateKey;
  if (!keyToUse) {
    return null;
  }
  nostrClient = new BarcNostrClient();
  await nostrClient.init(keyToUse);
  if (privateKey && privateKey !== stored.privateKey) {
    await chrome.storage.local.set({ privateKey });
  }
  nostrClient.onMessage((msg) => {
    if (!dashboardOpen && !msg.isOwn) {
      unreadCount++;
      updateBadge();
    }
    broadcastToAll({ type: "NEW_MESSAGE", message: msg, url: currentChannelUrl });
  });
  nostrClient.onPresence((users) => {
    updateBadge();
    broadcastToAll({ type: "PRESENCE_UPDATE", users, url: currentChannelUrl });
  });
  nostrClient.onGlobalActivity((activity) => {
    broadcastToAll({ type: "GLOBAL_ACTIVITY", activity });
  });
  nostrClient.onDM((dm, otherPubkey) => {
    if (!dashboardOpen && !dm.isOwn) {
      unreadCount++;
      updateBadge();
    }
    broadcastToAll({ type: "NEW_DM", dm, otherPubkey });
  });
  return nostrClient;
}
async function joinChannel(url) {
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return { messages: [], users: [] };
  }
  const client = await initClient();
  if (!client) return { messages: [], users: [] };
  if (currentChannelUrl && currentChannelUrl !== url) {
    client.leaveChannel();
  }
  currentChannelUrl = url;
  const result = await client.joinChannel(url);
  if (userName) {
    await client.announcePresence(userName);
  }
  updateBadge();
  return {
    messages: result?.messages || [],
    users: client.getActiveUsers() || []
  };
}
async function broadcastToAll(message) {
  chrome.runtime.sendMessage(message).catch(() => {
  });
}
chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL("src/ui/dashboard.html");
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: dashboardUrl });
  }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true;
});
async function handleMessage(request, sender) {
  switch (request.type) {
    case "INIT": {
      const client = await initClient();
      return {
        publicKey: client?.publicKey || null,
        userName
      };
    }
    case "DASHBOARD_OPENED": {
      dashboardOpen = true;
      clearUnread();
      return { success: true };
    }
    case "GENERATE_KEY": {
      try {
        const privateKey = generatePrivateKey();
        const publicKey = getPublicKey2(privateKey);
        await chrome.storage.local.set({ privateKey });
        await initClient(privateKey);
        return { success: true, publicKey };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    case "IMPORT_KEY": {
      const parsed = parsePrivateKey(request.key);
      if (parsed.error) {
        return { success: false, error: parsed.error };
      }
      try {
        const publicKey = getPublicKey2(parsed.privateKey);
        await chrome.storage.local.set({ privateKey: parsed.privateKey });
        await initClient(parsed.privateKey);
        return { success: true, publicKey };
      } catch (error) {
        return { success: false, error: "Invalid private key" };
      }
    }
    case "JOIN_TAB_CHANNEL": {
      const result = await joinChannel(request.url);
      return result;
    }
    case "SEND_MESSAGE": {
      if (!nostrClient) {
        return { error: "Not connected" };
      }
      const targetUrl = request.url || currentChannelUrl;
      const event = await nostrClient.sendMessage(request.content, targetUrl);
      return { success: !!event, eventId: event?.id };
    }
    case "POST_TO_WALL": {
      if (!nostrClient) {
        return { error: "Not connected" };
      }
      const event = await nostrClient.postToWall(request.targetPubkey, request.content);
      return { success: !!event, eventId: event?.id };
    }
    case "FETCH_WALL_POSTS": {
      if (!nostrClient) {
        return { posts: [], error: "Not connected" };
      }
      try {
        const posts = await nostrClient.fetchWallPosts(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error("Failed to fetch wall posts:", error);
        return { posts: [], error: error.message };
      }
    }
    case "FETCH_MENTIONS": {
      if (!nostrClient) {
        return { posts: [], error: "Not connected" };
      }
      try {
        const posts = await nostrClient.fetchMentions(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error("Failed to fetch mentions:", error);
        return { posts: [], error: error.message };
      }
    }
    case "FETCH_USER_POSTS": {
      if (!nostrClient) {
        return { posts: [], error: "Not connected" };
      }
      try {
        const posts = await nostrClient.fetchUserPosts(request.targetPubkey, request.limit || 50);
        return { posts };
      } catch (error) {
        console.error("Failed to fetch user posts:", error);
        return { posts: [], error: error.message };
      }
    }
    case "SEND_DM": {
      if (!nostrClient) {
        return { error: "Not connected" };
      }
      const event = await nostrClient.sendDM(request.recipientPubkey, request.content);
      return { success: !!event, eventId: event?.id };
    }
    case "GET_DM_CONVERSATIONS": {
      return {
        conversations: nostrClient?.getDMConversations() || []
      };
    }
    case "GET_DM_CONVERSATION": {
      return {
        messages: nostrClient?.getDMConversation(request.pubkey) || []
      };
    }
    case "SET_USERNAME": {
      userName = request.name;
      await chrome.storage.local.set({ userName });
      if (nostrClient && nostrClient.currentChannelId) {
        await nostrClient.announcePresence(userName);
      }
      return { success: true };
    }
    case "GET_STATUS": {
      return {
        connected: nostrClient?.relays.some((r) => r.connected) || false,
        channelId: nostrClient?.currentChannelId || null,
        url: currentChannelUrl,
        users: nostrClient?.getActiveUsers() || [],
        publicKey: nostrClient?.publicKey || null,
        unreadCount,
        globalActivity: nostrClient?.getGlobalActivity() || []
      };
    }
    case "GET_GLOBAL_ACTIVITY": {
      return {
        activity: nostrClient?.getGlobalActivity() || []
      };
    }
    case "GET_ALL_TAB_COUNTS": {
      const counts = {};
      const activity = nostrClient?.getGlobalActivity() || [];
      for (const item of activity) {
        counts[item.url] = item.userCount;
      }
      return { counts };
    }
    case "FETCH_MESSAGES": {
      if (!nostrClient) {
        return { messages: [], error: "Not connected" };
      }
      try {
        const messages = await nostrClient.fetchMessages(
          request.url,
          request.since,
          request.until,
          request.limit
        );
        return { messages };
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        return { messages: [], error: error.message };
      }
    }
    default:
      return { error: "Unknown message type" };
  }
}
chrome.runtime.onStartup.addListener(async () => {
  await initClient();
});
chrome.runtime.onInstalled.addListener(async () => {
  await initClient();
});
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive" && nostrClient?.currentChannelId) {
    nostrClient.announcePresence(userName);
    updateBadge();
  }
});
/*! Bundled license information:

@noble/secp256k1/index.js:
  (*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=background.js.map
