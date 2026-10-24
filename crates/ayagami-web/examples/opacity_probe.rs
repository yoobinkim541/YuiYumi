//! Diagnostic: show the keyed opacities along an ArtMesh's deformer chain to
//! explain opacity divergences against Cubism Core.
//! Usage: cargo run --release --example opacity_probe -- <moc3> <ArtMeshId>
use ayagami::core::{
    ArtMesh, ArtMeshForm, Collection, Deformer, Item, Model, Param, ParamMap, Part, RotDeformer, RotForm,
    TypedDeformer, WarpDeformer, WarpForm,
};
use ayagami::file::ParsedModel;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let model = ParsedModel::load(&mut std::fs::File::open(&a[1]).unwrap()).unwrap();
    let am = model.artmeshes().into_iter().find(|m| m.id() == a[2]).expect("artmesh");
    let ops: Vec<f32> = am.forms().into_iter().map(|f| f.opacity()).collect();
    println!("artmesh {} form opacities {:?} part={:?}", am.id(), ops, am.part().map(|p| p.id().to_string()));
    let maps: Vec<u32> = am.param_maps().into_iter().map(|m| m.uid()).collect();
    for p in model.params() {
        for pm in p.param_maps() {
            if maps.contains(&pm.uid()) {
                println!("  keyed by {} [{}, {}] keys {:?}", p.id(), p.min(), p.max(), pm.keypoints());
            }
        }
    }
    let mut d = am.deformer().map(|d| d.uid());
    while let Some(uid) = d {
        let def = model.deformers().get(uid).unwrap();
        let ops: Vec<f32> = match Deformer::typed(&*def) {
            TypedDeformer::Warp(w) => w.forms().into_iter().map(|f| f.opacity()).collect(),
            TypedDeformer::Rotation(r) => r.forms().into_iter().map(|f| f.opacity()).collect(),
        };
        println!("  deformer {} visible={} form opacities {:?}", def.id(), def.visible(), ops);
        d = def.parent().map(|p| p.uid());
    }
}
