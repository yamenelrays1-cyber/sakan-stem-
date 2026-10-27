#!/usr/bin/env python3
"""
Builds a real, valid, v1 + v2 cryptographically signed Android APK
(public/stem-arish-orders.apk) for the STEM El Arish Dorm Orders app.
"""
import hashlib
import os
import struct
import subprocess
import tempfile
import zlib

APP_URL_DEFAULT = os.environ.get("APP_URL", "/?source=pwa&mode=student")


# ============================================================================
# 1. ANDROID BINARY XML (AXML) GENERATOR FOR AndroidManifest.xml
# ============================================================================
def build_axml_manifest(package_name: str = "com.stemarish.orders", app_label: str = "طلبات السكن - STEM ARISH") -> bytes:
    # Resource-mapped attribute names MUST come first in the string pool (indices 0..10)
    res_attr_strings = [
        ("theme", 0x01010000),
        ("label", 0x01010001),
        ("name", 0x01010003),
        ("exported", 0x01010010),
        ("configChanges", 0x0101001F),
        ("minSdkVersion", 0x0101020C),
        ("versionCode", 0x0101021B),
        ("versionName", 0x0101021C),
        ("targetSdkVersion", 0x01010270),
        ("usesCleartextTraffic", 0x010104EC),
    ]

    other_strings = [
        "android",
        "http://schemas.android.com/apk/res/android",
        "",
        "manifest",
        "package",
        package_name,
        "1.0",
        "uses-sdk",
        "uses-permission",
        "android.permission.INTERNET",
        "application",
        app_label,
        "activity",
        f"{package_name}.MainActivity",
        "intent-filter",
        "action",
        "android.intent.action.MAIN",
        "category",
        "android.intent.category.LAUNCHER",
    ]

    all_strings = [s for s, _ in res_attr_strings] + other_strings
    str_idx = {s: i for i, s in enumerate(all_strings)}

    # Encode UTF-16LE string pool
    encoded_strings = []
    offsets = []
    cur_offset = 0
    for s in all_strings:
        u16 = s.encode("utf-16le")
        char_len = len(s)
        entry = struct.pack("<H", char_len) + u16 + struct.pack("<H", 0)
        offsets.append(cur_offset)
        encoded_strings.append(entry)
        cur_offset += len(entry)

    strings_blob = b"".join(encoded_strings)
    while len(strings_blob) % 4 != 0:
        strings_blob += b"\x00"

    string_count = len(all_strings)
    header_size = 28
    strings_start = header_size + string_count * 4
    pool_chunk_size = strings_start + len(strings_blob)

    string_pool_chunk = struct.pack(
        "<HHIIIIII",
        0x0001,          # RES_STRING_POOL_TYPE
        header_size,
        pool_chunk_size,
        string_count,
        0,               # styleCount
        0,               # flags (0 = UTF-16)
        strings_start,
        0,               # stylesStart
    ) + b"".join(struct.pack("<I", o) for o in offsets) + strings_blob

    # Resource ID Map Chunk (type 0x0180)
    res_ids = [r for _, r in res_attr_strings]
    res_map_size = 8 + len(res_ids) * 4
    res_map_chunk = struct.pack("<HHI", 0x0180, 8, res_map_size) + b"".join(
        struct.pack("<I", r) for r in res_ids
    )

    ns_prefix = str_idx["android"]
    ns_uri = str_idx["http://schemas.android.com/apk/res/android"]
    NO_IDX = 0xFFFFFFFF

    def start_ns(line: int) -> bytes:
        return struct.pack("<HHIIII", 0x0100, 16, 24, line, NO_IDX, ns_prefix) + struct.pack("<I", ns_uri)

    def end_ns(line: int) -> bytes:
        return struct.pack("<HHIIII", 0x0101, 16, 24, line, NO_IDX, ns_prefix) + struct.pack("<I", ns_uri)

    def attr_entry(ns: int, name_s: str, raw_s: int, data_type: int, data_val: int) -> bytes:
        return struct.pack(
            "<IIIHBBI",
            ns,
            str_idx[name_s],
            raw_s,
            8,          # size of Res_value
            0,          # res0
            data_type,
            data_val & 0xFFFFFFFF,
        )

    def start_elem(line: int, name_s: str, attrs: list[bytes]) -> bytes:
        chunk_size = 36 + len(attrs) * 20
        return (
            struct.pack(
                "<HHIIIIIHHHHHH",
                0x0102,         # RES_XML_START_ELEMENT_TYPE
                16,
                chunk_size,
                line,
                NO_IDX,
                NO_IDX,         # elem ns
                str_idx[name_s],
                20,             # attributeStart
                20,             # attributeSize
                len(attrs),     # attributeCount
                0,              # idIndex
                0,              # classIndex
                0,              # styleIndex
            )
            + b"".join(attrs)
        )

    def end_elem(line: int, name_s: str) -> bytes:
        return struct.pack(
            "<HHIIIIII",
            0x0103,             # RES_XML_END_ELEMENT_TYPE
            16,
            24,
            line,
            NO_IDX,
            NO_IDX,
            str_idx[name_s],
            0,
        )[:24]

    TYPE_REFERENCE = 0x01
    TYPE_STRING = 0x03
    TYPE_INT_DEC = 0x10
    TYPE_INT_HEX = 0x11
    TYPE_INT_BOOLEAN = 0x12

    xml_chunks = []
    xml_chunks.append(start_ns(2))

    # <manifest> (sorted by resId first: versionCode 0x0101021b, versionName 0x0101021c, then package)
    xml_chunks.append(
        start_elem(
            2,
            "manifest",
            [
                attr_entry(ns_uri, "versionCode", NO_IDX, TYPE_INT_DEC, 1),
                attr_entry(ns_uri, "versionName", str_idx["1.0"], TYPE_STRING, str_idx["1.0"]),
                attr_entry(NO_IDX, "package", str_idx[package_name], TYPE_STRING, str_idx[package_name]),
            ],
        )
    )

    # <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="28" />
    xml_chunks.append(
        start_elem(
            3,
            "uses-sdk",
            [
                attr_entry(ns_uri, "minSdkVersion", NO_IDX, TYPE_INT_DEC, 21),
                attr_entry(ns_uri, "targetSdkVersion", NO_IDX, TYPE_INT_DEC, 28),
            ],
        )
    )
    xml_chunks.append(end_elem(3, "uses-sdk"))

    # <uses-permission android:name="android.permission.INTERNET" />
    xml_chunks.append(
        start_elem(
            4,
            "uses-permission",
            [
                attr_entry(
                    ns_uri,
                    "name",
                    str_idx["android.permission.INTERNET"],
                    TYPE_STRING,
                    str_idx["android.permission.INTERNET"],
                ),
            ],
        )
    )
    xml_chunks.append(end_elem(4, "uses-permission"))

    # <application android:theme="@android:style/Theme.NoTitleBar" android:label="..." android:usesCleartextTraffic="true">
    xml_chunks.append(
        start_elem(
            5,
            "application",
            [
                attr_entry(ns_uri, "theme", NO_IDX, TYPE_REFERENCE, 0x01030006),  # Theme.Light.NoTitleBar -> 0x0103000c / 0x01030006
                attr_entry(ns_uri, "label", str_idx[app_label], TYPE_STRING, str_idx[app_label]),
                attr_entry(ns_uri, "usesCleartextTraffic", NO_IDX, TYPE_INT_BOOLEAN, 0xFFFFFFFF),
            ],
        )
    )

    # <activity android:label="..." android:name="..." android:exported="true" android:configChanges="0x04a0">
    act_name = f"{package_name}.MainActivity"
    xml_chunks.append(
        start_elem(
            6,
            "activity",
            [
                attr_entry(ns_uri, "label", str_idx[app_label], TYPE_STRING, str_idx[app_label]),
                attr_entry(ns_uri, "name", str_idx[act_name], TYPE_STRING, str_idx[act_name]),
                attr_entry(ns_uri, "exported", NO_IDX, TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                attr_entry(ns_uri, "configChanges", NO_IDX, TYPE_INT_HEX, 0x000004A0),
            ],
        )
    )

    # <intent-filter>
    xml_chunks.append(start_elem(7, "intent-filter", []))
    xml_chunks.append(
        start_elem(
            8,
            "action",
            [
                attr_entry(
                    ns_uri,
                    "name",
                    str_idx["android.intent.action.MAIN"],
                    TYPE_STRING,
                    str_idx["android.intent.action.MAIN"],
                ),
            ],
        )
    )
    xml_chunks.append(end_elem(8, "action"))
    xml_chunks.append(
        start_elem(
            9,
            "category",
            [
                attr_entry(
                    ns_uri,
                    "name",
                    str_idx["android.intent.category.LAUNCHER"],
                    TYPE_STRING,
                    str_idx["android.intent.category.LAUNCHER"],
                ),
            ],
        )
    )
    xml_chunks.append(end_elem(9, "category"))
    xml_chunks.append(end_elem(7, "intent-filter"))

    xml_chunks.append(end_elem(6, "activity"))
    xml_chunks.append(end_elem(5, "application"))
    xml_chunks.append(end_elem(2, "manifest"))
    xml_chunks.append(end_ns(2))

    body = string_pool_chunk + res_map_chunk + b"".join(xml_chunks)
    total_size = 8 + len(body)
    return struct.pack("<HHI", 0x0003, 8, total_size) + body


# ============================================================================
# 2. DALVIK EXECUTABLE (classes.dex) GENERATOR FOR MainActivity WebView
# ============================================================================
def uleb128(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value != 0:
            byte |= 0x80
        out.append(byte)
        if value == 0:
            break
    return bytes(out)


def build_dex(app_url: str) -> bytes:
    strings = sorted(
        [
            "<init>",
            "L",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Landroid/webkit/WebViewClient;",
            "Lcom/stemarish/orders/MainActivity;",
            "Ljava/lang/Object;",
            "Ljava/lang/String;",
            "MainActivity.java",
            "V",
            "VL",
            "VZ",
            "Z",
            app_url,
            "getSettings",
            "loadUrl",
            "onCreate",
            "setContentView",
            "setDomStorageEnabled",
            "setJavaScriptEnabled",
            "setWebViewClient",
        ]
    )
    s_idx = {s: i for i, s in enumerate(strings)}

    type_descriptors = sorted(
        [
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Landroid/webkit/WebViewClient;",
            "Lcom/stemarish/orders/MainActivity;",
            "Ljava/lang/Object;",
            "Ljava/lang/String;",
            "V",
            "Z",
        ]
    )
    t_idx = {t: i for i, t in enumerate(type_descriptors)}

    # Protos: (shorty, return_type, param_types_tuple)
    protos = [
        ("L", "Landroid/webkit/WebSettings;", ()),               # ()WebSettings
        ("V", "V", ()),                                          # ()V
        ("VL", "V", ("Landroid/content/Context;",)),             # (Context)V
        ("VL", "V", ("Landroid/os/Bundle;",)),                   # (Bundle)V
        ("VL", "V", ("Landroid/view/View;",)),                   # (View)V
        ("VL", "V", ("Landroid/webkit/WebViewClient;",)),        # (WebViewClient)V
        ("VL", "V", ("Ljava/lang/String;",)),                    # (String)V
        ("VZ", "V", ("Z",)),                                     # (Z)V
    ]
    p_idx = {p: i for i, p in enumerate(protos)}

    # Methods: (class_type, proto_tuple, name) -> sorted by (class_idx, name_idx, proto_idx)
    raw_methods = [
        ("Landroid/app/Activity;", ("V", "V", ()), "<init>"),
        ("Landroid/app/Activity;", ("VL", "V", ("Landroid/os/Bundle;",)), "onCreate"),
        ("Landroid/app/Activity;", ("VL", "V", ("Landroid/view/View;",)), "setContentView"),
        ("Landroid/webkit/WebSettings;", ("VZ", "V", ("Z",)), "setDomStorageEnabled"),
        ("Landroid/webkit/WebSettings;", ("VZ", "V", ("Z",)), "setJavaScriptEnabled"),
        ("Landroid/webkit/WebView;", ("VL", "V", ("Landroid/content/Context;",)), "<init>"),
        ("Landroid/webkit/WebView;", ("L", "Landroid/webkit/WebSettings;", ()), "getSettings"),
        ("Landroid/webkit/WebView;", ("VL", "V", ("Ljava/lang/String;",)), "loadUrl"),
        ("Landroid/webkit/WebView;", ("VL", "V", ("Landroid/webkit/WebViewClient;",)), "setWebViewClient"),
        ("Landroid/webkit/WebViewClient;", ("V", "V", ()), "<init>"),
        ("Lcom/stemarish/orders/MainActivity;", ("V", "V", ()), "<init>"),
        ("Lcom/stemarish/orders/MainActivity;", ("VL", "V", ("Landroid/os/Bundle;",)), "onCreate"),
    ]
    methods = sorted(raw_methods, key=lambda m: (t_idx[m[0]], s_idx[m[2]], p_idx[m[1]]))
    m_idx = {(m[0], m[2], m[1]): i for i, m in enumerate(methods)}

    # Code item 1: MainActivity.<init>()V
    m_activity_init = m_idx[("Landroid/app/Activity;", "<init>", ("V", "V", ()))]
    insns_init = struct.pack("<HHHH", 0x1070, m_activity_init, 0x0000, 0x000E)
    code_init = struct.pack("<HHHHII", 1, 1, 1, 0, 0, len(insns_init) // 2) + insns_init

    # Code item 2: MainActivity.onCreate(Bundle)V
    m_super_oncreate = m_idx[("Landroid/app/Activity;", "onCreate", ("VL", "V", ("Landroid/os/Bundle;",)))]
    m_wv_init = m_idx[("Landroid/webkit/WebView;", "<init>", ("VL", "V", ("Landroid/content/Context;",)))]
    m_wv_settings = m_idx[("Landroid/webkit/WebView;", "getSettings", ("L", "Landroid/webkit/WebSettings;", ()))]
    m_ws_js = m_idx[("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("VZ", "V", ("Z",)))]
    m_ws_dom = m_idx[("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("VZ", "V", ("Z",)))]
    m_wvc_init = m_idx[("Landroid/webkit/WebViewClient;", "<init>", ("V", "V", ()))]
    m_wv_client = m_idx[("Landroid/webkit/WebView;", "setWebViewClient", ("VL", "V", ("Landroid/webkit/WebViewClient;",)))]
    m_wv_load = m_idx[("Landroid/webkit/WebView;", "loadUrl", ("VL", "V", ("Ljava/lang/String;",)))]
    m_set_view = m_idx[("Landroid/app/Activity;", "setContentView", ("VL", "V", ("Landroid/view/View;",)))]

    insns_oncreate = b"".join(
        [
            # invoke-super {v3, v4}, Activity.onCreate(Bundle)V
            struct.pack("<HHH", 0x206F, m_super_oncreate, 0x0043),
            # new-instance v0, WebView
            struct.pack("<HH", 0x0022, t_idx["Landroid/webkit/WebView;"]),
            # invoke-direct {v0, v3}, WebView.<init>(Context)V
            struct.pack("<HHH", 0x2070, m_wv_init, 0x0030),
            # invoke-virtual {v0}, WebView.getSettings()WebSettings
            struct.pack("<HHH", 0x106E, m_wv_settings, 0x0000),
            # move-result-object v1
            struct.pack("<H", 0x010C),
            # const/4 v2, #1
            struct.pack("<H", 0x1212),
            # invoke-virtual {v1, v2}, WebSettings.setJavaScriptEnabled(Z)V
            struct.pack("<HHH", 0x206E, m_ws_js, 0x0021),
            # invoke-virtual {v1, v2}, WebSettings.setDomStorageEnabled(Z)V
            struct.pack("<HHH", 0x206E, m_ws_dom, 0x0021),
            # new-instance v1, WebViewClient
            struct.pack("<HH", 0x0122, t_idx["Landroid/webkit/WebViewClient;"]),
            # invoke-direct {v1}, WebViewClient.<init>()V
            struct.pack("<HHH", 0x1070, m_wvc_init, 0x0001),
            # invoke-virtual {v0, v1}, WebView.setWebViewClient(WebViewClient)V
            struct.pack("<HHH", 0x206E, m_wv_client, 0x0010),
            # const-string v1, app_url
            struct.pack("<HH", 0x011A, s_idx[app_url]),
            # invoke-virtual {v0, v1}, WebView.loadUrl(String)V
            struct.pack("<HHH", 0x206E, m_wv_load, 0x0010),
            # invoke-virtual {v3, v0}, Activity.setContentView(View)V
            struct.pack("<HHH", 0x206E, m_set_view, 0x0003),
            # return-void
            struct.pack("<H", 0x000E),
        ]
    )
    code_oncreate = (
        struct.pack("<HHHHII", 5, 2, 2, 0, 0, len(insns_oncreate) // 2) + insns_oncreate
    )

    # Layout offsets inside DEX file
    header_size = 0x70
    string_ids_off = header_size
    type_ids_off = string_ids_off + len(strings) * 4
    proto_ids_off = type_ids_off + len(type_descriptors) * 4
    method_ids_off = proto_ids_off + len(protos) * 12
    class_defs_off = method_ids_off + len(methods) * 8
    data_off = class_defs_off + 32  # 1 class_def (32 bytes)

    data_buf = bytearray()

    def align4():
        while (data_off + len(data_buf)) % 4 != 0:
            data_buf.append(0)

    # 1. Type lists for protos with parameters
    proto_type_list_offs = []
    for _, _, params in protos:
        if not params:
            proto_type_list_offs.append(0)
        else:
            align4()
            off = data_off + len(data_buf)
            proto_type_list_offs.append(off)
            data_buf.extend(struct.pack("<I", len(params)))
            for p in params:
                data_buf.extend(struct.pack("<H", t_idx[p]))

    # 2. Code items (4-byte aligned)
    align4()
    code_init_off = data_off + len(data_buf)
    data_buf.extend(code_init)

    align4()
    code_oncreate_off = data_off + len(data_buf)
    data_buf.extend(code_oncreate)

    # 3. String data items
    string_data_offs = []
    for s in strings:
        off = data_off + len(data_buf)
        string_data_offs.append(off)
        utf8_bytes = s.encode("utf-8")
        data_buf.extend(uleb128(len(s)))
        data_buf.extend(utf8_bytes)
        data_buf.append(0)

    # 4. Class data item for MainActivity
    class_data_off = data_off + len(data_buf)
    m_main_init = m_idx[("Lcom/stemarish/orders/MainActivity;", "<init>", ("V", "V", ()))]
    m_main_oncreate = m_idx[("Lcom/stemarish/orders/MainActivity;", "onCreate", ("VL", "V", ("Landroid/os/Bundle;",)))]
    class_data_bytes = (
        uleb128(0)  # static_fields_size
        + uleb128(0)  # instance_fields_size
        + uleb128(1)  # direct_methods_size (<init>)
        + uleb128(1)  # virtual_methods_size (onCreate)
        # direct_method[0]: <init>, PUBLIC | CONSTRUCTOR (0x10001)
        + uleb128(m_main_init)
        + uleb128(0x10001)
        + uleb128(code_init_off)
        # virtual_method[0]: onCreate, PROTECTED (0x0004)
        + uleb128(m_main_oncreate)
        + uleb128(0x0004)
        + uleb128(code_oncreate_off)
    )
    data_buf.extend(class_data_bytes)

    # 5. Map list (4-byte aligned at end of data section)
    align4()
    map_off = data_off + len(data_buf)
    map_items = [
        (0x0000, 1, 0),
        (0x0001, len(strings), string_ids_off),
        (0x0002, len(type_descriptors), type_ids_off),
        (0x0003, len(protos), proto_ids_off),
        (0x0005, len(methods), method_ids_off),
        (0x0006, 1, class_defs_off),
        (0x1001, sum(1 for _, _, p in protos if p), data_off),
        (0x2001, 2, code_init_off),
        (0x2002, len(strings), string_data_offs[0]),
        (0x2000, 1, class_data_off),
        (0x1000, 1, map_off),
    ]
    data_buf.extend(struct.pack("<I", len(map_items)))
    for m_type, m_size, m_offset in map_items:
        data_buf.extend(struct.pack("<HHII", m_type, 0, m_size, m_offset))

    align4()
    file_size = data_off + len(data_buf)
    data_size = len(data_buf)

    # Build index tables
    string_ids_bin = b"".join(struct.pack("<I", o) for o in string_data_offs)
    type_ids_bin = b"".join(struct.pack("<I", s_idx[t]) for t in type_descriptors)
    proto_ids_bin = b"".join(
        struct.pack("<III", s_idx[shorty], t_idx[ret], tl_off)
        for (shorty, ret, _), tl_off in zip(protos, proto_type_list_offs)
    )
    method_ids_bin = b"".join(
        struct.pack("<HHI", t_idx[c], p_idx[p], s_idx[n]) for c, p, n in methods
    )
    class_defs_bin = struct.pack(
        "<IIIIIIII",
        t_idx["Lcom/stemarish/orders/MainActivity;"],
        0x0001,  # ACC_PUBLIC
        t_idx["Landroid/app/Activity;"],
        0,       # interfaces_off
        s_idx["MainActivity.java"],
        0,       # annotations_off
        class_data_off,
        0,       # static_values_off
    )

    header_without_hashes = struct.pack(
        "<IIIIIIIIIIIIIIIIIIII",
        file_size,
        header_size,
        0x12345678,  # ENDIAN_CONSTANT
        0,           # link_size
        0,           # link_off
        map_off,
        len(strings),
        string_ids_off,
        len(type_descriptors),
        type_ids_off,
        len(protos),
        proto_ids_off,
        0,           # field_ids_size
        0,           # field_ids_off
        len(methods),
        method_ids_off,
        1,           # class_defs_size
        class_defs_off,
        data_size,
        data_off,
    )

    body_after_sha = (
        header_without_hashes
        + string_ids_bin
        + type_ids_bin
        + proto_ids_bin
        + method_ids_bin
        + class_defs_bin
        + bytes(data_buf)
    )
    sha1_digest = hashlib.sha1(body_after_sha).digest()
    adler_val = zlib.adler32(sha1_digest + body_after_sha) & 0xFFFFFFFF

    return b"dex\n035\x00" + struct.pack("<I", adler_val) + sha1_digest + body_after_sha


# ============================================================================
# 3. MINIMAL resources.arsc GENERATOR
# ============================================================================
def build_resources_arsc(package_name: str = "com.stemarish.orders") -> bytes:
    # Empty string pool chunk (28 bytes)
    str_pool = struct.pack("<HHIIIIII", 0x0001, 28, 28, 0, 0, 0, 28, 0)
    # Package chunk (0x0200, headerSize=288)
    pkg_name_u16 = package_name.encode("utf-16le").ljust(256, b"\x00")
    pkg_header = (
        struct.pack("<HHII", 0x0200, 288, 288 + len(str_pool) * 2, 0x7F)
        + pkg_name_u16
        + struct.pack("<IIIIII", 288, 0, 288 + len(str_pool), 0, 0, 0)
    )
    pkg_chunk = pkg_header + str_pool + str_pool
    total_size = 12 + len(str_pool) + len(pkg_chunk)
    table_header = struct.pack("<HHII", 0x0002, 12, total_size, 1)
    return table_header + str_pool + pkg_chunk


# ============================================================================
# 4. APK SIGNATURE SCHEME V1 + V2 BUILDER
# ============================================================================
def compute_v2_chunk_digest(data_slices: list[bytes]) -> bytes:
    chunk_digests = []
    CHUNK_SIZE = 1024 * 1024
    for s in data_slices:
        pos = 0
        while pos < len(s):
            chunk = s[pos : pos + CHUNK_SIZE]
            pos += CHUNK_SIZE
            h = hashlib.sha256()
            h.update(b"\xa5" + struct.pack("<I", len(chunk)))
            h.update(chunk)
            chunk_digests.append(h.digest())
    top = hashlib.sha256()
    top.update(b"\x5a" + struct.pack("<I", len(chunk_digests)))
    for d in chunk_digests:
        top.update(d)
    return top.digest()


def build_signed_apk(output_path: str, app_url: str = APP_URL_DEFAULT) -> bytes:
    manifest_xml = build_axml_manifest()
    classes_dex = build_dex(app_url)
    resources_arsc = build_resources_arsc()

    with tempfile.TemporaryDirectory() as tmp:
        key_pem = os.path.join(tmp, "key.pem")
        cert_pem = os.path.join(tmp, "cert.pem")
        cert_der = os.path.join(tmp, "cert.der")

        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-keyout",
                key_pem,
                "-out",
                cert_pem,
                "-days",
                "10000",
                "-nodes",
                "-subj",
                "/CN=STEM El Arish/O=STEM Arish/C=EG",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["openssl", "x509", "-in", cert_pem, "-outform", "DER", "-out", cert_der],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with open(cert_der, "rb") as f:
            cert_der_bytes = f.read()

        # Build v1 JAR signature files (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA)
        import base64

        def b64_sha256(b: bytes) -> str:
            return base64.b64encode(hashlib.sha256(b).digest()).decode("ascii")

        entries = [
            ("AndroidManifest.xml", manifest_xml),
            ("classes.dex", classes_dex),
            ("resources.arsc", resources_arsc),
        ]

        mf_sections = ["Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n"]
        sf_entries = []
        for name, content in entries:
            sec = f"Name: {name}\r\nSHA-256-Digest: {b64_sha256(content)}\r\n\r\n"
            mf_sections.append(sec)
            sf_entries.append(
                f"Name: {name}\r\nSHA-256-Digest: {b64_sha256(sec.encode('utf-8'))}\r\n\r\n"
            )

        manifest_mf = "".join(mf_sections).encode("utf-8")
        sf_header = (
            "Signature-Version: 1.0\r\n"
            "Created-By: 1.0 (Android)\r\n"
            f"SHA-256-Digest-Manifest: {b64_sha256(manifest_mf)}\r\n\r\n"
        )
        cert_sf = (sf_header + "".join(sf_entries)).encode("utf-8")

        sf_path = os.path.join(tmp, "CERT.SF")
        rsa_path = os.path.join(tmp, "CERT.RSA")
        with open(sf_path, "wb") as f:
            f.write(cert_sf)

        subprocess.run(
            [
                "openssl",
                "cms",
                "-sign",
                "-binary",
                "-noattr",
                "-in",
                sf_path,
                "-signer",
                cert_pem,
                "-inkey",
                key_pem,
                "-outform",
                "DER",
                "-out",
                rsa_path,
                "-md",
                "sha256",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with open(rsa_path, "rb") as f:
            cert_rsa = f.read()

        all_zip_files = [
            ("AndroidManifest.xml", manifest_xml, True),
            ("classes.dex", classes_dex, True),
            ("resources.arsc", resources_arsc, False),  # Uncompressed + 4-byte aligned
            ("META-INF/MANIFEST.MF", manifest_mf, True),
            ("META-INF/CERT.SF", cert_sf, True),
            ("META-INF/CERT.RSA", cert_rsa, True),
        ]

        # Construct ZIP Local File Entries & Central Directory manually for exact v2 signing control
        local_Parts = bytearray()
        cd_Parts = bytearray()

        for filename, raw_data, compress in all_zip_files:
            fn_bytes = filename.encode("utf-8")
            crc = zlib.crc32(raw_data) & 0xFFFFFFFF
            uncomp_size = len(raw_data)

            if compress:
                comp_obj = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)
                comp_data = comp_obj.compress(raw_data) + comp_obj.flush()
                method = 8
            else:
                comp_data = raw_data
                method = 0

            comp_size = len(comp_data)
            local_header_offset = len(local_Parts)

            # Align uncompressed entries (like resources.arsc) to 4-byte boundary via extra field
            extra = b""
            if not compress:
                data_start = local_header_offset + 30 + len(fn_bytes)
                pad = (4 - (data_start % 4)) % 4
                if pad:
                    extra = b"\x00" * pad

            lfh = struct.pack(
                "<IHHHHHIIIHH",
                0x04034B50,
                20,
                0,
                method,
                0,
                0x21,
                crc,
                comp_size,
                uncomp_size,
                len(fn_bytes),
                len(extra),
            )
            local_Parts.extend(lfh + fn_bytes + extra + comp_data)

            cde = struct.pack(
                "<IHHHHHHIIIHHHHHII",
                0x02014B50,
                20,
                20,
                0,
                method,
                0,
                0x21,
                crc,
                comp_size,
                uncomp_size,
                len(fn_bytes),
                0,
                0,
                0,
                0,
                0,
                local_header_offset,
            )
            cd_Parts.extend(cde + fn_bytes)

        before_cd = bytes(local_Parts)
        cd_bytes = bytes(cd_Parts)
        num_entries = len(all_zip_files)

        # Build APK Signature Scheme v2 Block
        # Placeholder EOCD with cd_offset pointing to where CD will be AFTER the v2 signing block
        # First compute signed_data with digest over (before_cd, cd_bytes, eocd_with_before_cd_offset)
        # Note: Per APK Signature Scheme v2 spec, the EOCD hashed in v2 has the CD offset set to the offset of the APK Signing Block (= len(before_cd))!
        eocd_for_hash = struct.pack(
            "<IHHHHIIH",
            0x06054B50,
            0,
            0,
            num_entries,
            num_entries,
            len(cd_bytes),
            len(before_cd),
            0,
        )

        content_digest = compute_v2_chunk_digest([before_cd, cd_bytes, eocd_for_hash])

        # Signature algorithm ID: 0x0103 = RSASSA-PKCS1-v1_5 with SHA256
        ALGO_ID = 0x0103
        digest_entry = struct.pack("<II", ALGO_ID, len(content_digest)) + content_digest
        digests_seq = struct.pack("<I", len(digest_entry)) + digest_entry

        cert_seq = struct.pack("<I", len(cert_der_bytes)) + cert_der_bytes
        additional_attrs = b""

        signed_data = (
            struct.pack("<I", len(digests_seq))
            + digests_seq
            + struct.pack("<I", len(cert_seq))
            + cert_seq
            + struct.pack("<I", len(additional_attrs))
            + additional_attrs
        )

        sd_path = os.path.join(tmp, "signed_data.bin")
        sig_path = os.path.join(tmp, "sig.bin")
        with open(sd_path, "wb") as f:
            f.write(signed_data)

        subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key_pem, "-out", sig_path, sd_path],
            check=True,
        )
        with open(sig_path, "rb") as f:
            rsa_sig_bytes = f.read()

        # Extract SubjectPublicKeyInfo (DER) for the signer block
        pub_der = os.path.join(tmp, "pub.der")
        subprocess.run(
            ["openssl", "pkey", "-in", key_pem, "-pubout", "-outform", "DER", "-out", pub_der],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with open(pub_der, "rb") as f:
            spki_bytes = f.read()

        sig_entry = struct.pack("<II", ALGO_ID, len(rsa_sig_bytes)) + rsa_sig_bytes
        sigs_seq = struct.pack("<I", len(sig_entry)) + sig_entry

        signer = (
            struct.pack("<I", len(signed_data))
            + signed_data
            + struct.pack("<I", len(sigs_seq))
            + sigs_seq
            + struct.pack("<I", len(spki_bytes))
            + spki_bytes
        )
        signers_seq = struct.pack("<I", len(signer)) + signer
        v2_block_value = struct.pack("<I", len(signers_seq)) + signers_seq

        # ID-value pair: uint64 len(4 + len(v2_block_value)) + uint32 ID (0x7109871a) + v2_block_value
        pair_payload = struct.pack("<I", 0x7109871A) + v2_block_value
        id_value_pair = struct.pack("<Q", len(pair_payload)) + pair_payload

        # Pad to multiple of 4096 if desired, or standard APK Sig Block 42
        block_size_field = len(id_value_pair) + 8 + 16
        apk_sig_block = (
            struct.pack("<Q", block_size_field)
            + id_value_pair
            + struct.pack("<Q", block_size_field)
            + b"APK Sig Block 42"
        )

        final_cd_offset = len(before_cd) + len(apk_sig_block)
        final_eocd = struct.pack(
            "<IHHHHIIH",
            0x06054B50,
            0,
            0,
            num_entries,
            num_entries,
            len(cd_bytes),
            final_cd_offset,
            0,
        )

        apk_bytes = before_cd + apk_sig_block + cd_bytes + final_eocd
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(apk_bytes)
        return apk_bytes


if __name__ == "__main__":
    import sys

    url = sys.argv[1] if len(sys.argv) > 1 else APP_URL_DEFAULT
    out = sys.argv[2] if len(sys.argv) > 2 else "public/stem-arish-orders.apk"
    apk = build_signed_apk(out, url)
    print(f"Built signed APK ({len(apk)} bytes) -> {out}")
