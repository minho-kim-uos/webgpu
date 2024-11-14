@vertex fn main_vert(@location(${loc_position}) position: vec2f)
    -> @builtin(position) vec4f {
    return vec4f(position, 0, 1);
}

@fragment fn main_frag() -> @location(0) vec4f {
    return vec4f(1, 0, 0, 1);
}
 
