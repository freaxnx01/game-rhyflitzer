"""The Rhy Tanker's 3D model (assets/tanker.glb, #1103): a three-axle truck with a drawbar tank trailer. The file is checked
directly (its JSON chunk) and built in the page with three.js (the game's own importmap), not through VEHICLES, so the
model's contract holds on its own. Slow (Playwright): run in the foreground."""
import base64
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from test_carselect import open_page

GLB = Path(__file__).parents[1] / "assets" / "tanker.glb"
TRUCK_WHEELS = ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR", "wheel_RL2", "wheel_RR2"]
TRAILER_WHEELS = ["trailer_wheel_L1", "trailer_wheel_R1", "trailer_wheel_L2", "trailer_wheel_R2"]
# the source's badge and plate parts, by the material names tools/prepare-tanker.mjs drops (the MAN lettering, the plate text,
# the branded tyre textures)
DROPPED_MATERIALS = ["Metalic", "Back_Trailor", "Tyre_sidewalls", "Tyre_tread", "Rims", "Hubs", "Red_Light_Back"]

# loads the glb with the page's three.js, measures every named node and renders the truck side-on into a data URL
LOAD_JS = """async (url) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url), root = gltf.scene;
  root.updateMatrixWorld(true);
  const nodes = {}, materials = {};
  let triangles = 0;
  root.traverse((o) => {
    if (o.name) {   // a multi-primitive node is a Group of meshes: the box covers its subtree, in world space
      const b = new THREE.Box3().setFromObject(o, true);
      nodes[o.name] = { parent: o.parent?.name ?? null, position: o.position.toArray(), extras: o.userData, box: { min: b.min.toArray(), max: b.max.toArray() }, worldY: o.getWorldPosition(new THREE.Vector3()).y };
    }
    if (o.isMesh) {
      triangles += Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials[m.name] = m.userData;
    }
  });
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1600, 500);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfd8e3); scene.add(root);
  scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x6a6a5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(5, 10, 6); scene.add(sun);
  const h = size.x / 2 * 1.05 / 3.2, cam = new THREE.OrthographicCamera(-h * 3.2, h * 3.2, h, -h, 0.1, 100);
  cam.position.set(c.x, c.y, c.z + 40); cam.lookAt(c); renderer.render(scene, cam);
  const png = renderer.domElement.toDataURL('image/png'); renderer.dispose();
  return { nodes, materials, triangles, bounds: { min: box.min.toArray(), max: box.max.toArray() }, png };
}"""


def read_glb_json(path):
    b = path.read_bytes()
    assert b[:4] == b"glTF", "glTF magic"
    length = int.from_bytes(b[12:16], "little")
    assert b[16:20] == b"JSON", "JSON chunk first"
    return json.loads(b[20:20 + length].decode("utf8"))


def test_tanker_glb_file_is_unbranded_meshopt_only_within_budget():
    """The committed file: every contract node is there, no texture or image at all (the source's tyre textures carried a
    brand), none of the dropped materials, EXT_meshopt_compression and nothing else, at most 45k triangles."""
    assert GLB.exists(), "run tools/prepare-tanker.mjs and copy the result to assets/tanker.glb"
    j = read_glb_json(GLB)
    names = {n.get("name") for n in j["nodes"]}
    for n in ["tanker", "body", "trailer", "trailer_body", *TRUCK_WHEELS, *TRAILER_WHEELS]:
        assert n in names, n
    assert not j.get("textures") and not j.get("images"), "no textures"
    assert j["extensionsUsed"] == ["EXT_meshopt_compression"], j["extensionsUsed"]
    text = json.dumps(j)
    for m in DROPPED_MATERIALS:
        assert m not in text, m
    for word in ["MAN", "TGX", "DevPoly", "YOKOHAMA"]:
        assert word not in json.dumps([x.get("name") for x in j["nodes"] + j["meshes"] + j["materials"]]), word
    # as drawn: per node, so a wheel mesh shared by several nodes counts every time
    triangles = sum(j["accessors"][p["indices"]]["count"] // 3 for n in j["nodes"] if "mesh" in n for p in j["meshes"][n["mesh"]]["primitives"])
    assert 30000 <= triangles <= 45000, triangles
    assert GLB.stat().st_size <= 1200 * 1024, GLB.stat().st_size


def test_tanker_model_contract_wheels_on_the_ground_and_the_trailer_at_the_hitch(server, tmp_path):
    """Built with three.js: the six truck wheels and four trailer wheels stand on y = 0 with 1.07 m tyres; the trailer node
    hangs under the root at the hitch with its own body and wheels; the root extras give the hitch, the trailer length and
    an overall length of 17-21 m; the lamp and glass materials carry their extras. A side-on screenshot lands in tmp_path."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        got = page.evaluate(LOAD_JS, "./assets/tanker.glb")
        b.close()
    shot = tmp_path / "tanker-side.png"
    shot.write_bytes(base64.b64decode(got["png"].split(",", 1)[1]))
    print("side view:", shot)
    nodes = got["nodes"]
    assert nodes["body"]["parent"] == "tanker" and nodes["trailer"]["parent"] == "tanker" and nodes["trailer_body"]["parent"] == "trailer", nodes
    for w in TRUCK_WHEELS:
        assert nodes[w]["parent"] == "tanker", w
    for w in TRAILER_WHEELS:
        assert nodes[w]["parent"] == "trailer", w
    for w in TRUCK_WHEELS + TRAILER_WHEELS:
        n = nodes[w]
        radius = (n["box"]["max"][1] - n["box"]["min"][1]) / 2
        assert abs(radius - 0.535) <= 0.02, (w, radius)
        assert abs(n["box"]["min"][1]) <= 0.02, (w, n["box"], "the tyre touches y = 0")
        assert abs((n["box"]["max"][1] + n["box"]["min"][1]) / 2 - n["worldY"]) <= 0.02, (w, "vertices centred on the axle")
    assert nodes["wheel_FL"]["position"][2] < 0 < nodes["wheel_FR"]["position"][2], "left is -z"
    assert nodes["wheel_FL"]["position"][0] > nodes["wheel_RL"]["position"][0] > nodes["wheel_RL2"]["position"][0], "front axle ahead of the tandem"
    assert nodes["trailer_wheel_L1"]["position"][0] > nodes["trailer_wheel_L2"]["position"][0] and nodes["trailer_wheel_L1"]["position"][0] < 0
    extras = nodes["tanker"]["extras"]
    assert all(isinstance(extras[k], (int, float)) for k in ["hitch", "trailerLength", "length"]), extras
    assert 17 < extras["length"] < 21, extras
    assert abs(nodes["trailer"]["position"][0] + extras["hitch"]) <= 0.01, (nodes["trailer"]["position"], extras)
    mid = (nodes["trailer_wheel_L1"]["position"][0] + nodes["trailer_wheel_L2"]["position"][0]) / 2
    assert abs(-mid - extras["trailerLength"]) <= 0.01, (mid, extras)
    assert abs((got["bounds"]["max"][0] - got["bounds"]["min"][0]) - extras["length"]) <= 0.05, (got["bounds"], extras)
    assert got["triangles"] <= 45000, got["triangles"]
    mats = got["materials"]
    assert mats["Glass"] == {"glass": True} and mats["LampHead"] == {"lamp": "head"} and mats["LampTail"] == {"lamp": "tail"}, mats
    assert not errors, errors
