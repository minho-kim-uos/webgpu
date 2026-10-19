import {mat4, utils} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';

"use strict";

const loc_aPosition = 3;
const loc_aTexCoord = 5;
const loc_inter_stage_texCoord = 1;

const id_group = 0;
const binding_sampler = 0;
const binding_texture = 1;
const binding_MVP = 2;

async function main()
{
    const canvas = document.getElementById('webgpu');
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if(!device)
    {
        throw Error("WebGPU not supported.");
    }
    const context = canvas.getContext("webgpu");
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device, format: preferredFormat});

    document.getElementById("mag-LINEAR").value = "linear";
    document.getElementById("mag-NEAREST").value = "nearest";

    document.getElementById("min-LINEAR").value = "linear";
    document.getElementById("min-NEAREST").value = "nearest";

    document.getElementById("mipmap-LINEAR").value = "linear";
    document.getElementById("mipmap-NEAREST").value = "nearest";

    const checkbox_mipmap_enabled = document.getElementById("mipmap-enabled");
    const select_mipmap_filter = document.getElementById("mipmap-filter");
    function update_mipmap_filter_enabled()
    {
        select_mipmap_filter.disabled = !checkbox_mipmap_enabled.checked;
    }
    checkbox_mipmap_enabled.addEventListener("change", update_mipmap_filter_enabled);
    update_mipmap_filter_enabled();

    const src_shaders =
    `
    struct VertexOut {
        @builtin(position) position: vec4f,
        @location(${loc_inter_stage_texCoord}) texCoord: vec2f,
    };

    @group(${id_group}) @binding(${binding_MVP}) var<uniform> MVP: mat4x4f;

    @vertex fn main_vert(
        @location(${loc_aPosition}) aPosition: vec2f,
        @location(${loc_aTexCoord}) aTexCoord: vec2f)
        -> VertexOut
    {
        var output: VertexOut;
        output.position = MVP * vec4f(aPosition, 0, 1);
        output.texCoord = aTexCoord;
        return output;
    }

    @group(${id_group}) @binding(${binding_sampler}) var uSampler: sampler;
    @group(${id_group}) @binding(${binding_texture}) var uTexture: texture_2d<f32>;

    @fragment fn main_frag(@location(${loc_inter_stage_texCoord}) texCoord: vec2f)
        -> @location(0) vec4f
    {
        return textureSample(uTexture, uSampler, texCoord);
    }
    `;

    const shaderModule = device.createShaderModule({label:"mipmap shader", code: src_shaders});

    const obj = initVBO(device, loc_aPosition, loc_aTexCoord);

    const pipeline = device.createRenderPipeline({
        label: "mipmap pipeline",
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "main_vert",
            buffers: [obj.layout],
        },
        fragment: {
            module: shaderModule,
            entryPoint: "main_frag",
            targets: [{format: preferredFormat}],
        },
        primitive: {topology: "triangle-strip"},
    });

    const textures =
    {
        "checkerboard"    : generate_tex_checkerboard(device, 32),
        "separate_colors" : generate_tex_mipmap(device, 6, [[255,0,0], [0,255,0], [0,0,255], [255,255,0], [255,0,255], [0,255,255]]),
    };

    const uniformBufferMVP = device.createBuffer({
        size: 4*4*4,    // 4x4 matrix
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    function set_uniforms()
    {
        const tex = textures[document.getElementById("texture").value];

        const samplerDesc = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: document.getElementById("mag-filter").value,
            minFilter: document.getElementById("min-filter").value,
            mipmapFilter: document.getElementById("mipmap-filter").value,
        };
        if(!document.getElementById("mipmap-enabled").checked)
        {
            // Clamping the LOD range to level 0 forces sampling from the
            // base level only, i.e. mipmapping disabled.
            samplerDesc.lodMinClamp = 0;
            samplerDesc.lodMaxClamp = 0;
        }
        const sampler = device.createSampler(samplerDesc);

        return device.createBindGroup({
            layout: pipeline.getBindGroupLayout(id_group),
            entries: [
                {binding: binding_sampler, resource: sampler},
                {binding: binding_texture, resource: tex.createView()},
                {binding: binding_MVP, resource: {buffer: uniformBufferMVP}},
            ],
        });
    }

    const X_MIN = -2;
    const X_MAX = 2;
    const X_STEP = 1.5;

    let t_last = Date.now();
    let sign = 1;
    let x = 0;

    function tick()
    {
        let now = Date.now();
        let elapsed = now - t_last;
        t_last = now;

        x += sign * (document.getElementById("speed").value*0.01) * elapsed * 0.001;
        if(x > X_MAX)
        {
            x = X_MAX;
            sign *= -1;
        }
        else if(x < X_MIN)
        {
            x = X_MIN;
            sign *= -1;
        }

        let MVP = mat4.perspective(utils.degToRad(60), 1, 1, 100);
        MVP = mat4.multiply(MVP, mat4.lookAt([x,-10,1], [0,0,0], [0,0,1]));
        MVP = mat4.scale(MVP, [20.0, 20.0, 20.0]);

        device.queue.writeBuffer(uniformBufferMVP, 0, MVP);

        const bindGroup = set_uniforms();

        const encoder = device.createCommandEncoder();
        const passRender = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: {r:0.2, g:0.2, b:0.2, a:1},
                storeOp: "store",
            }],
        });
        passRender.setPipeline(pipeline);
        passRender.setVertexBuffer(0, obj.vertexBuffer);
        passRender.setBindGroup(id_group, bindGroup);
        passRender.draw(obj.n);
        passRender.end();
        device.queue.submit([encoder.finish()]);

        requestAnimationFrame(tick); // Request that the browser calls tick
    }

    tick();
}

function generate_tex_checkerboard(device, N)
{
    const numLevels = Math.log2(N) + 1;
    const mips = [];

    const img0 = new Uint8Array(N*N*4);
    for(let i=0 ; i<N ; i++)
    {
        for(let j=0 ; j<N ; j++)
        {
            let color;
            if(((i < (N/2))+(j < (N/2)))%2 == 0)    color = 255;
            else                                    color = 0;
            img0[4*(N*i + j) + 0] = color;
            img0[4*(N*i + j) + 1] = color;
            img0[4*(N*i + j) + 2] = color;
            img0[4*(N*i + j) + 3] = 255;
        }
    }
    mips.push(img0);

    // WebGPU has no gl.generateMipmap() equivalent -- the chain below is
    // generated on the CPU with a simple box filter instead.
    for(let level=1 ; level<numLevels ; level++)
    {
        const N_prev = N >> (level-1);
        const N_curr = N_prev >> 1;
        const prev = mips[level-1];
        const curr = new Uint8Array(N_curr*N_curr*4);
        for(let i=0 ; i<N_curr ; i++)
        {
            for(let j=0 ; j<N_curr ; j++)
            {
                for(let k=0 ; k<4 ; k++)
                {
                    const sum =
                        prev[4*((2*i)*N_prev   + (2*j))   + k] +
                        prev[4*((2*i)*N_prev   + (2*j+1)) + k] +
                        prev[4*((2*i+1)*N_prev + (2*j))   + k] +
                        prev[4*((2*i+1)*N_prev + (2*j+1)) + k];
                    curr[4*(i*N_curr + j) + k] = sum/4;
                }
            }
        }
        mips.push(curr);
    }

    const tex = device.createTexture({
        label: "checkerboard",
        size: [N, N],
        format: "rgba8unorm",
        mipLevelCount: numLevels,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    for(let level=0 ; level<numLevels ; level++)
    {
        const N_level = N >> level;
        device.queue.writeTexture(
            {texture:tex, mipLevel:level},
            mips[level],
            {bytesPerRow: N_level*4},
            {width: N_level, height: N_level},
        );
    }

    return tex;
}

function generate_tex_mipmap(device, levels, colors)
{
    const N = Math.pow(2, levels-1);
    const tex = device.createTexture({
        label: "separate colors",
        size: [N, N],
        format: "rgba8unorm",
        mipLevelCount: levels,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    for(let level = 0 ; level < levels ; level++)
    {
        let N_level = Math.pow(2, levels-level-1);
        let img = new Uint8Array(N_level*N_level*4);
        for(let i=0 ; i<N_level ; i++)
        {
            for(let j=0 ; j<N_level ; j++)
            {
                for(let k=0 ; k<3 ; k++) img[4*(i*N_level + j) + k] = colors[level][k];
                img[4*(i*N_level + j) + 3] = 255;
            }
        }
        device.queue.writeTexture(
            {texture:tex, mipLevel:level},
            img,
            {bytesPerRow: N_level*4},
            {width: N_level, height: N_level},
        );
    }

    return tex;
}

function initVBO(device, loc_aPosition, loc_aTexCoord)
{
    const verts = new Float32Array([
        -0.5,  0.5,   0, 20,
        -0.5, -0.5,   0, 0,
         0.5,  0.5,   20, 20,
         0.5, -0.5,   20, 0,
    ]);

    const vertexBuffer = device.createBuffer({
        label: "mipmap quad vertices",
        size: verts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, verts);

    const SZ = verts.BYTES_PER_ELEMENT;

    const layout = {
        arrayStride: SZ*4,
        attributes: [
            {format:"float32x2", offset:0,    shaderLocation: loc_aPosition},
            {format:"float32x2", offset:SZ*2, shaderLocation: loc_aTexCoord},
        ],
    };

    return {vertexBuffer, layout, n:4};
}

main();
