import SwiftUI
import UniformTypeIdentifiers

/// Downloads the authenticated document bytes and offers the native iOS share
/// sheet. Word/Excel files stay in the sandbox until explicitly shared.
struct NativeGeneratedDocumentCard: View {
    let document: NativeGeneratedDocument

    @State private var url: URL?
    @State private var isLoading = false
    @State private var errorText: String?

    private var descriptor: (icon: String, label: String, tint: Color) {
        if document.mimeType.contains("spreadsheet") ||
            document.mimeType.contains("excel") ||
            document.fileName.lowercased().hasSuffix(".xlsx") {
            return ("tablecells", "Excel · таблица", Color.green)
        }
        if document.mimeType.contains("wordprocessing") ||
            document.mimeType.contains("word") ||
            document.fileName.lowercased().hasSuffix(".docx") {
            return ("doc.richtext", "Word · документ", Color.blue)
        }
        if document.mimeType == "application/pdf" {
            return ("doc.text", "PDF · документ", Color.red)
        }
        return ("doc.zipper", "Файл", Color.purple)
    }

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: descriptor.icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(descriptor.tint)
                .frame(width: 48, height: 55)
                .background(descriptor.tint.opacity(0.1),
                            in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(document.fileName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                    .foregroundStyle(.primary)
                Text(descriptor.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let errorText {
                    Text(errorText)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            Spacer(minLength: 0)
            if isLoading {
                ProgressView()
            } else if let url {
                ShareLink(item: url, preview: SharePreview(document.fileName)) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 18, weight: .medium))
                }
                .accessibilityLabel("Скачать или отправить \(document.fileName)")
            } else {
                Button {
                    Task { await load() }
                } label: {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 18, weight: .medium))
                }
                .accessibilityLabel("Скачать \(document.fileName)")
            }
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
        .onChange(of: document.id) { _, _ in
            url = nil
            errorText = nil
        }
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await NativeAPI().downloadGeneratedDocument(id: document.id)
            guard !data.isEmpty && data.count <= 40_000_000 else {
                throw DownloadError.invalidSize
            }
            let name = (document.fileName as NSString).lastPathComponent
            let clean = String(name.unicodeScalars.filter {
                CharacterSet.alphanumerics.contains($0) ||
                    CharacterSet(charactersIn: "-_. ()[]").contains($0)
            })
            let fileName = clean.isEmpty ? document.id + ".bin" : clean
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent(
                "planirovych-doc-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let destination = dir.appendingPathComponent(fileName)
            try data.write(to: destination, options: .atomic)
            url = destination
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
    }

    private enum DownloadError: LocalizedError {
        case invalidSize
        var errorDescription: String? { "Не удалось загрузить документ или файл слишком большой." }
    }
}
