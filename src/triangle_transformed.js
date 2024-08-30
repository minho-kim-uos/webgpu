import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';

const loc_position = 1;

const id_group_transformation = 0;
const id_binding_matrices = 4;

function toRadian(deg) { return deg*Math.PI / 180.0; }


async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if(!device) {
        throw Error("WebGPU not supported.");
    }
    const canvas = document.querySelector("#webgpu");
    const context = canvas.getContext("webgpu");
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: preferredFormat,
    });

    const {buffer:vertexBuffer, layout:layoutVertexBuffer, count:countVertices}
        = initVertexBuffer(device);

    const {module:shaderModule, entry_vert, entry_frag} = initShaderModule(device);

    const pipeline = initPipeline(device, preferredFormat, shaderModule, entry_vert, entry_frag, layoutVertexBuffer);

    const uniformBuffer = device.createBuffer({
        size: 4 * 16 * 3,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        label:"rotating triangle bind group",
        layout: pipeline.getBindGroupLayout(id_group_transformation),
        entries:[{
            binding:id_binding_matrices,
            resource:{buffer:uniformBuffer}
        }],
    });

    const matrices = new Float32Array(4*4*3);

    console.log(matrices.byteLength);

    let S = mat4.identity();
    let R = mat4.identity();
    let T = mat4.identity();
    const offset_S = 4*4*0;
    const offset_R = 4*4*1;
    const offset_T = 4*4*2;

    const renderPassDescriptor = {
       colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: {r:0, g:0, b:0.4, a:1},
                storeOp: "store",
        }]
    };

    let time_elapsed, time_prev, time_curr;
    time_prev = Date.now();

    function tick() {
        time_curr = Date.now(); // milliseconds
        time_elapsed = time_curr - time_prev;
        time_prev = time_curr;

        S = mat4.scaling([.5,.5,.5]);
        R = mat4.rotateZ(R, toRadian(time_elapsed*0.1));
        T = mat4.translation([0.5, 0, 0]);

        matrices.set(S, offset_S);
        matrices.set(R, offset_R);
        matrices.set(T, offset_T);

        device.queue.writeBuffer(
            uniformBuffer,
            0,
            matrices.buffer,
            matrices.byteOffset,
            matrices.byteLength
        );

        renderPassDescriptor.colorAttachments[0].view
            = context.getCurrentTexture().createView();
        
        const encoder = device.createCommandEncoder();
        const passRender = encoder.beginRenderPass(renderPassDescriptor);
        passRender.setPipeline(pipeline);
        passRender.setVertexBuffer(0, vertexBuffer);
        passRender.setBindGroup(id_group_transformation, bindGroup);
        passRender.draw(countVertices);
        passRender.end();
        device.queue.submit([encoder.finish()]);

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function initVertexBuffer(device) {
    const vertices = new Float32Array([
         0.0, 0.8,
        -0.8,-0.8,
         0.8,-0.8,
    ]);
    const buffer = device.createBuffer({
        label:"triangle vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, vertices);

    const layoutVertexBuffer = {
        arrayStride: 8,
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: loc_position,
        }],
    };
    return {buffer:buffer, layout:layoutVertexBuffer, count:vertices.length/2};
}

function initShaderModule(device) {
    const src_vert = `
        struct Matrices {
            S: mat4x4<f32>,
            R: mat4x4<f32>,
            T: mat4x4<f32>,
        };
        @group(${id_group_transformation}) @binding(${id_binding_matrices}) var<uniform> matrices: Matrices;
        @vertex fn main_vert(@location(${loc_position}) position: vec2f)
            -> @builtin(position) vec4f {
            return matrices.T*matrices.R*matrices.S * vec4f(position, 0, 1);
        }
    `;
    const src_frag = `
        @fragment fn main_frag() -> @location(0) vec4f {
            return vec4f(1, 0, 0, 1);
        }
    `;
    const shaderModule = device.createShaderModule({
        label: "rotating triangle shader",
        code:src_vert + src_frag,
    });
    return {module:shaderModule, entry_vert:"main_vert", entry_frag:"main_frag"};
}

function initPipeline(device, canvasFormat, shaderModule, entry_vert, entry_frag, layoutVertexBuffer) {
    const pipeline = device.createRenderPipeline({
        label: "rotating triangle pipeline",
        layout: "auto",
        vertex: {
            module:shaderModule,
            entryPoint: entry_vert,
            buffers: [layoutVertexBuffer],
        },
        fragment: {
            module:shaderModule,
            entryPoint: entry_frag,
            targets: [{
                format: canvasFormat
            }]
        },
    });
    return pipeline;
}

main();

