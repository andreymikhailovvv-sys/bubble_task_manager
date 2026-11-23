import SwiftUI

/// Image bytes are loaded from the authenticated, owner-scoped document API.
/// The card never follows arbitrary URLs or interpolated [[file_ref=...]] text.
struct NativeGeneratedImageCard: View {
    let document: NativeGeneratedDocument

    @State private var image: UIImage?
    @State private var downloadURL: URL?
    @State private var error: String?
    @State private var isLoading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if isLoading {
                HStack {
                    ProgressView()
                    Text("Загружаем изображение…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 125)
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .accessibilityLabel("Изображение \(document.fileName)")
            } else if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }
            HStack(spacing: 8) {
                Image(systemName: "photo")
                    .foregroundStyle(.purple)
                Text(document.fileName)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let downloadURL {
                    ShareLink(item: downloadURL,
                              preview: SharePreview(document.fileName)) {
                        Label("Скачать", systemImage: "square.and.arrow.up")
                            .font(.caption.weight(.semibold))
                    }
                    .accessibilityLabel("Скачать или сохранить изображение")
                } else if !isLoading {
                    Button("Повторить") { Task { await load() } }
                        .font(.caption)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.purple.opacity(0.07),
                    in: RoundedRectangle(cornerRadius: 17))
        .task(id: document.id) { await load() }
    }

    private func load() async {
        guard document.isImage, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await NativeAPI().downloadGeneratedDocument(id: document.id)
            guard data.count <= 25_000_000, let decoded = UIImage(data: data) else {
                throw ImageError.invalid
            }
            let suffix = (document.fileName as NSString).pathExtension.lowercased()
            let ext = ["png", "jpeg", "jpg", "webp"].contains(suffix) ? suffix : "png"
            let target = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + "." + ext)
            try data.write(to: target, options: .atomic)
            image = decoded
            downloadURL = target
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private enum ImageError: LocalizedError {
        case invalid
        var errorDescription: String? {
            "Не удалось открыть изображение."
        }
    }
}
