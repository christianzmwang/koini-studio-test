// Render synthetic HDR colours through the same RealityRenderer output as Koini.
// No rooms, models, account data or app installation are needed. See README for use.
import Foundation
import CoreGraphics
import Metal
import RealityKit
import UIKit

let size = 33
let width = size * size * 2, height = size * 2
let destination = CommandLine.arguments.dropFirst().first ?? "/tmp/koini-native-tone-p3.png"
let device = MTLCreateSystemDefaultDevice()!
let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm_srgb, width: width, height: height, mipmapped: false)
descriptor.usage = [.renderTarget, .shaderRead]
descriptor.storageMode = .shared
let target = device.makeTexture(descriptor: descriptor)!
let renderer = try RealityRenderer()
let output = try RealityRenderer.CameraOutput(.singleProjection(colorTexture: target))
let camera = Entity()
camera.components.set(PerspectiveCameraComponent(near: 0.01, far: 100, fieldOfViewInDegrees: Float(2 * atan((1.0 / Double(size)) / 2) * 180 / .pi)))
camera.position = [0, 0, 2]
renderer.entities.append(camera)
renderer.activeCamera = camera
let textureWidth = size * size, textureHeight = size
var pixels = [Float](repeating: 1, count: textureWidth * textureHeight * 4)
for g in 0..<size {
    for b in 0..<size {
        for r in 0..<size {
            let offset = (g * textureWidth + b * size + r) * 4
            for (c, value) in [r,g,b].enumerated() {
                pixels[offset+c] = Float((pow(2, Double(value) / Double(size - 1) * 8) - 1) / 16)
            }
        }
    }
}
let data = pixels.withUnsafeBytes { Data($0) }
let provider = CGDataProvider(data: data as CFData)!
let image = CGImage(width: textureWidth, height: textureHeight, bitsPerComponent: 32, bitsPerPixel: 128, bytesPerRow: textureWidth * 16,
                    space: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!,
                    bitmapInfo: [.floatComponents, .byteOrder32Little, CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)],
                    provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
let texture = try TextureResource(image: image, options: .init(semantic: .color))
var material = UnlitMaterial(applyPostProcessToneMap: true)
material.color = .init(tint: .white, texture: .init(texture))
let plane = ModelEntity(mesh: .generatePlane(width: 2, height: 2 / Float(size)), materials: [material])
renderer.entities.append(plane)
renderer.cameraSettings.colorBackground = .color(CGColor(gray: 0, alpha: 1))
for _ in 0..<6 {
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
        do { try renderer.updateAndRender(deltaTime: 0, cameraOutput: output, onComplete: { _ in done.resume() }) }
        catch { done.resume(throwing: error) }
    }
}
var bytes = [UInt8](repeating: 0, count: width * height * 4)
target.getBytes(&bytes, bytesPerRow: width * 4, from: MTLRegionMake2D(0,0,width,height), mipmapLevel: 0)
let outProvider = CGDataProvider(data: Data(bytes) as CFData)!
let out = CGImage(width:width,height:height,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:width*4,
                  space:CGColorSpace(name:CGColorSpace.displayP3)!,bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),
                  provider:outProvider,decode:nil,shouldInterpolate:false,intent:.defaultIntent)!
try UIImage(cgImage:out).pngData()!.write(to:URL(fileURLWithPath:destination))

print("Rendered RealityKit HDR tone atlas to \(destination)")
