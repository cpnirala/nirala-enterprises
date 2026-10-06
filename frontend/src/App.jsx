import { useEffect, useRef, useState } from "react";

// ---------- Helpers ----------

const money = (value) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
    }).format(value / 100);

const newKey = () => crypto.randomUUID();

async function api(path, options = {}) {
    const multipart = options.body instanceof FormData;

    const response = await fetch("/api" + path, {
        ...options,
        credentials: "same-origin",
        headers: {
            ...(multipart ? {} : { "Content-Type": "application/json" }),
            ...options.headers,
        },
        body: options.body ?
            multipart ?
            options.body :
            JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message =
            typeof data.detail === "string" ?
            data.detail :
            Array.isArray(data.detail) ?
            data.detail.map((item) => item.msg).join("; ") :
            "Request failed. Please try again.";

        throw new Error(message);
    }

    return data;
}

const emptyProduct = {
    name: "",
    category: "Fire extinguishers",
    description: "",
    price: "",
    stock: "0",
    image: "",
    active: true,
};

const emptyClient = {
    name: "",
    logo: "",
};

const transitions = {
    "Pending confirmation": ["Confirmed", "Cancelled"],
    Confirmed: ["Dispatched", "Cancelled"],
    Dispatched: ["Completed"],
    Completed: [],
    Cancelled: [],
};

// ---------- Shared components ----------

function Field({ label, children, ...props }) {
    return ( <label className = "field" >
        <span > { label } </span> {
        children || <input {...props }
        />} </label>
    );
}

function Empty({ children }) {
    return <div className = "empty" > { children } </div>;
}

function ProductImage({ src, name }) {
    return src ? ( <img className = "product-image"
        src = { src }
        alt = { name }
        loading = "lazy" />
    ) : ( <div className = "product-image no-image" >
        NIRALA ENTERPRISES </div>
    );
}

function ClientCards({ clients }) {
    if (!clients.length) {
        return <Empty > Client details will be added soon. </Empty>;
    }

    return ( <div className = "client-grid" > {
            clients.map((client) => ( <article className = "client"
                key = { client.id } > {
                    client.logo ? ( <img src = { client.logo }
                        alt = { `${client.name} logo` }
                        loading = "lazy" />
                    ) : ( <div className = "client-initial"
                        aria-hidden = "true" > { client.name.slice(0, 1) } </div>
                    )
                }

                <h3 > { client.name } </h3> </article>
            ))
        } </div>
    );
}

function ReviewCard({ review }) {
    return ( <article className = "review" >
        <span className = "stars"
        aria-label = { `${review.rating} out of 5 stars` } > { "★".repeat(review.rating) } </span>

        <p > { review.comment } </p> <strong > { review.name } </strong> </article>
    );
}

function OrderCard({ order, admin, onStatus, busy }) {
    const dateText = /(?:Z|[+-]\d{2}:\d{2})$/.test(order.created_at) ?
        order.created_at :
        order.created_at + "Z";

    return ( <article className = "order" >
        <div className = "split" >
        <div >
        <h3 > Order# { order.id } </h3> <small > { new Date(dateText).toLocaleString("en-IN") } </small> </div>

        <span className = "badge" > { order.status } </span> </div>

        <ul > {
            order.items.map((item) => ( <li key = { item.product_id } >
                <span > { item.name }× { item.quantity } </span>

                <strong > { money(item.price_paise * item.quantity) } </strong> </li>
            ))
        } </ul>

        <div className = "split" >
        <strong > Product total </strong> <strong > { money(order.total_paise) } </strong> </div>

        <p > { order.name }· { order.phone } <br /> { order.address } </p>

        {
            order.notes && <p > Note: { order.notes } </p>}

            <small >
                No online payment collected.Delivery and final charges
            will be confirmed by our team. </small>

            {
                admin && ( <div className = "actions" > {
                        (transitions[order.status] || []).map((status) => ( <button type = "button"
                            key = { status }
                            disabled = { busy }
                            className = {
                                status === "Cancelled" ? "danger" : "secondary"
                            }
                            onClick = {
                                () => {
                                    if (
                                        status !== "Cancelled" ||
                                        window.confirm(
                                            "Cancel this order and restore its stock?"
                                        )
                                    ) {
                                        onStatus(order.id, status);
                                    }
                                }
                            } > {
                                status === "Cancelled" ?
                                "Cancel order" : "Mark " + status
                            } </button>
                        ))
                    } </div>
                )
            } </article>
        );
    }

    // ---------- Main application ----------

    export default function App() {
        const [page, setPage] = useState("home");
        const [user, setUser] = useState(null);
        const [initializing, setInitializing] = useState(true);

        const [products, setProducts] = useState([]);
        const [clients, setClients] = useState([]);
        const [reviews, setReviews] = useState([]);

        const [cart, setCart] = useState([]);
        const [orders, setOrders] = useState([]);
        const [mine, setMine] = useState(null);

        const [adminProducts, setAdminProducts] = useState([]);
        const [adminReviews, setAdminReviews] = useState([]);
        const [adminOrders, setAdminOrders] = useState([]);
        const [tab, setTab] = useState("products");

        const [notice, setNotice] = useState(null);
        const [busy, setBusy] = useState(false);
        const [loading, setLoading] = useState(false);
        const [menu, setMenu] = useState(false);

        const [authMode, setAuthMode] = useState("login");
        const [search, setSearch] = useState("");
        const [category, setCategory] = useState("All");

        const [productForm, setProductForm] = useState({
            ...emptyProduct,
        });

        const [clientForm, setClientForm] = useState({
            ...emptyClient,
        });

        const [reviewForm, setReviewForm] = useState({
            rating: 5,
            comment: "",
        });

        const requestKey = useRef(newKey());
        const busyRef = useRef(false);

        function tell(text, error = false) {
            setNotice({ text, error });
        }

        function go(nextPage) {
            setPage(nextPage);
            setMenu(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }

        // ---------- Load data ----------

        async function loadPublic() {
            const [productData, clientData, reviewData] =
            await Promise.all([
                api("/products"),
                api("/clients"),
                api("/testimonials"),
            ]);

            setProducts(productData);
            setClients(clientData);
            setReviews(reviewData);
        }

        async function loadCustomer() {
            const [cartData, orderData, reviewData] =
            await Promise.all([
                api("/cart"),
                api("/orders"),
                api("/testimonials/mine"),
            ]);

            setCart(cartData);
            setOrders(orderData);
            setMine(reviewData);

            if (reviewData) {
                setReviewForm({
                    rating: reviewData.rating,
                    comment: reviewData.comment,
                });
            }
        }

        async function loadAdmin() {
            const [productData, orderData, reviewData] =
            await Promise.all([
                api("/admin/products"),
                api("/admin/orders"),
                api("/admin/testimonials"),
            ]);

            setAdminProducts(productData);
            setAdminOrders(orderData);
            setAdminReviews(reviewData);
        }

        async function refresh() {
            await loadPublic();

            if (user ?.role === "admin") {
                await loadAdmin();
            }

            if (user ?.role === "customer") {
                await loadCustomer();
            }
        }

        async function run(task, success) {
            if (busyRef.current) return;

            busyRef.current = true;
            setBusy(true);
            setNotice(null);

            try {
                await task();

                if (success) {
                    tell(success);
                }
            } catch (error) {
                tell(error.message, true);
            } finally {
                busyRef.current = false;
                setBusy(false);
            }
        }

        useEffect(() => {
            let live = true;

            Promise.all([
                    loadPublic(),
                    api("/auth/me").catch(() => null),
                ])
                .then(([, currentUser]) => {
                    if (live) {
                        setUser(currentUser);
                    }
                })
                .catch((error) => {
                    if (live) {
                        tell(
                            "Unable to load the website. Check the backend and refresh. " +
                            error.message,
                            true
                        );
                    }
                })
                .finally(() => {
                    if (live) {
                        setInitializing(false);
                    }
                });

            return () => {
                live = false;
            };
        }, []);

        useEffect(() => {
            if (!user) return;

            setLoading(true);

            const task =
                user.role === "admin" ? loadAdmin() : loadCustomer();

            task
                .catch((error) => tell(error.message, true))
                .finally(() => setLoading(false));
        }, [user]);

        // ---------- Authentication ----------

        async function auth(event) {
            event.preventDefault();

            const form = new FormData(event.currentTarget);

            await run(
                async() => {
                    const body = {
                        email: form.get("email"),
                        password: form.get("password"),
                    };

                    if (authMode === "signup") {
                        body.name = form.get("name");
                    }

                    const currentUser = await api("/auth/" + authMode, {
                        method: "POST",
                        body,
                    });

                    setUser(currentUser);

                    go(
                        currentUser.role === "admin" ? "admin" : "products"
                    );
                },
                authMode === "signup" ?
                "Your account is ready." :
                "Welcome back."
            );
        }

        async function logout() {
            await run(async() => {
                await api("/auth/logout", { method: "POST" });

                setUser(null);
                setCart([]);
                setOrders([]);
                setMine(null);
                setReviewForm({ rating: 5, comment: "" });

                setAdminProducts([]);
                setAdminOrders([]);
                setAdminReviews([]);

                requestKey.current = newKey();

                go("home");
            });
        }

        // ---------- Cart and orders ----------

        async function addToCart(product) {
            if (!user) {
                setAuthMode("login");
                go("account");
                tell("Log in or create an account to add products.");
                return;
            }

            if (user.role !== "customer") {
                tell(
                    "Please use a customer account to place an order.",
                    true
                );
                return;
            }

            await run(async() => {
                const line = cart.find(
                    (item) => item.product.id === product.id
                );

                await api("/cart/" + product.id, {
                    method: "PUT",
                    body: {
                        quantity: (line ?.quantity || 0) + 1,
                    },
                });

                requestKey.current = newKey();
                await loadCustomer();
            }, "Added to your cart.");
        }

        async function cartQuantity(id, quantity) {
            await run(async() => {
                await api("/cart/" + id, {
                    method: "PUT",
                    body: { quantity },
                });

                requestKey.current = newKey();
                await loadCustomer();
            });
        }

        async function checkout(event) {
            event.preventDefault();

            const form = new FormData(event.currentTarget);

            await run(async() => {
                const order = await api("/orders", {
                    method: "POST",
                    body: {
                        request_key: requestKey.current,
                        name: form.get("name"),
                        phone: form.get("phone"),
                        address: form.get("address"),
                        notes: form.get("notes"),
                    },
                });

                requestKey.current = newKey();

                await refresh();
                go("orders");

                tell(
                    "Order #" +
                    order.id +
                    " placed. Our team will confirm it with you."
                );
            });
        }

        async function updateOrderStatus(id, status) {
            await run(async() => {
                await api("/admin/orders/" + id, {
                    method: "PATCH",
                    body: { status },
                });

                await refresh();
            }, "Order updated.");
        }

        // ---------- Admin actions ----------

        async function upload(event, target, key) {
            const input = event.target;
            const file = input.files ?.[0];

            if (!file) return;

            await run(async() => {
                const body = new FormData();
                body.append("file", file);

                const result = await api("/admin/uploads", {
                    method: "POST",
                    body,
                });

                target((old) => ({
                    ...old,
                    [key]: result.url,
                }));
            }, "Image uploaded. Save the form to apply it.");

            input.value = "";
        }

        async function saveProduct(event) {
            event.preventDefault();

            await run(async() => {
                const { id, price, ...rest } = productForm;
                const value = Number(price);

                if (!Number.isFinite(value) || value <= 0) {
                    throw new Error("Enter a valid price above zero.");
                }

                await api(
                    "/admin/products" + (id ? "/" + id : ""), {
                        method: id ? "PUT" : "POST",
                        body: {
                            ...rest,
                            price_paise: Math.round(value * 100),
                            stock: Number(rest.stock),
                        },
                    }
                );

                setProductForm({...emptyProduct });
                await refresh();
            }, "Product saved.");
        }

        function editProduct(product) {
            setProductForm({
                id: product.id,
                name: product.name,
                category: product.category,
                description: product.description,
                price: (product.price_paise / 100).toFixed(2),
                stock: product.stock,
                image: product.image,
                active: product.active,
            });

            window.scrollTo({ top: 0, behavior: "smooth" });
        }

        async function archiveProduct(id) {
            if (!window.confirm(
                    "Archive this product? Existing orders will be retained."
                )) {
                return;
            }

            await run(async() => {
                await api("/admin/products/" + id, {
                    method: "DELETE",
                });

                await refresh();
            }, "Product archived.");
        }

        async function saveClient(event) {
            event.preventDefault();

            await run(async() => {
                const { id, ...body } = clientForm;

                await api(
                    "/admin/clients" + (id ? "/" + id : ""), {
                        method: id ? "PUT" : "POST",
                        body,
                    }
                );

                setClientForm({...emptyClient });
                await loadPublic();
            }, "Client saved.");
        }

        async function deleteClient(client) {
            if (!window.confirm("Delete " + client.name + "?")) {
                return;
            }

            await run(async() => {
                await api("/admin/clients/" + client.id, {
                    method: "DELETE",
                });

                if (clientForm.id === client.id) {
                    setClientForm({...emptyClient });
                }

                await loadPublic();
            }, "Client deleted.");
        }

        async function submitReview(event) {
            event.preventDefault();

            await run(async() => {
                await api("/testimonials/mine", {
                    method: "PUT",
                    body: {
                        ...reviewForm,
                        rating: Number(reviewForm.rating),
                    },
                });

                await loadCustomer();
                await loadPublic();
            }, "Your testimonial is pending admin approval.");
        }

        async function moderateReview(id, status) {
            await run(
                async() => {
                    await api("/admin/testimonials/" + id, {
                        method: "PATCH",
                        body: { status },
                    });

                    await refresh();
                },
                "Review " + status + "."
            );
        }

        // ---------- Derived values ----------

        const visibleProducts = products.filter(
            (product) =>
            (category === "All" ||
                product.category === category) &&
            (product.name + " " + product.description)
            .toLowerCase()
            .includes(search.toLowerCase())
        );

        const count = cart.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const total = cart.reduce(
            (sum, item) =>
            sum + item.product.price_paise * item.quantity,
            0
        );

        const invalidCart = cart.some(
            (item) =>
            !item.product.active ||
            item.quantity > item.product.stock
        );

        function productCards(list) {
            return ( <div className = "product-grid" > {
                    list.map((product) => ( <article className = "product"
                        key = { product.id } >
                        <ProductImage src = { product.image }
                        name = { product.name }
                        />

                        <div className = "product-body" >
                        <span className = "eyebrow" > { product.category } </span>

                        <h3 > { product.name } </h3> <p > { product.description } </p>

                        <div className = "split" >
                        <strong className = "price" > { money(product.price_paise) } </strong>

                        <span className = "muted" > {
                            product.stock > 0 ?
                            product.stock + " available" : "Out of stock"
                        } </span> </div>

                        <button type = "button"
                        disabled = { busy || product.stock === 0 }
                        onClick = {
                            () => addToCart(product)
                        } > {
                            product.stock === 0 ?
                            "Out of stock" : "Add to cart"
                        } </button> </div> </article>
                    ))
                } </div>
            );
        }

        return ( <>
            { /* Top bar */ }

            <div className = "topbar" >
            <div className = "wrap split" >
            <span > PROVIDING SAFETY </span> <a href = "tel:+919914864586" >
            +91 99148 64586 </a> </div> </div>

            { /* Navigation */ }

            <header >
            <div className = "wrap nav" >
            <button type = "button"
            className = "brand plain"
            onClick = {
                () => go("home")
            } >
            <b >
            Ne <span > . </span> </b>

            <span >
            NIRALA <small > ENTERPRISES </small> </span> </button>

            <button type = "button"
            className = "menu secondary"
            onClick = {
                () => setMenu(!menu)
            }
            aria-expanded = { menu }
            aria-controls = "navigation" > { menu ? "Close" : "Menu" } </button>

            <nav id = "navigation"
            className = { menu ? "open" : "" } > {
                [
                    ["home", "Home"],
                    ["products", "Products"],
                    ["clients", "Our clients"],
                    ["testimonials", "Testimonials"],
                ].map(([target, label]) => ( <button type = "button"
                    key = { target }
                    className = {
                        "nav-link " +
                        (page === target ? "selected" : "")
                    }
                    onClick = {
                        () => go(target)
                    } > { label } </button>
                ))
            }

            {
                user ?.role === "customer" && ( <>
                    <button type = "button"
                    className = "nav-link"
                    onClick = {
                        () => go("cart")
                    } >
                    <span
  role="img"
  aria-label={`Shopping cart, ${count} items`}
  title="Open cart"
  style={{
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "42px",
    height: "42px"
  }}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="27"
    height="27"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 3h2l2.4 12.1a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6" />
    <circle cx="10" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
  </svg>

  {count > 0 && (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "-2px",
        right: "-5px",
        minWidth: "21px",
        height: "21px",
        padding: "0 5px",
        borderRadius: "999px",
        backgroundColor: "#d9382f",
        color: "#ffffff",
        fontSize: "11px",
        fontWeight: 700,
        lineHeight: "21px",
        textAlign: "center"
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  )}
</span> </button>

                    <button type = "button"
                    className = "nav-link"
                    onClick = {
                        () => go("orders")
                    } >
                    My orders </button> </>
                )
            }

            {
                user ?.role === "admin" && ( <button type = "button"
                    className = "nav-link"
                    onClick = {
                        () => go("admin")
                    } >
                    Admin </button>
                )
            }

            {
                user ? ( <button type = "button"
                    className = "secondary"
                    disabled = { busy }
                    onClick = { logout } >
                    Log out </button>
                ) : ( <button type = "button"
                    onClick = {
                        () => go("account")
                    } >
                    Login / Sign up </button>
                )
            } </nav> </div> </header>

            { /* Notifications */ }

            {
                notice && ( <div className = {
                        "notice " + (notice.error ? "error" : "")
                    }
                    role = { notice.error ? "alert" : "status" } >
                    <span > { notice.text } </span>

                    <button type = "button"
                    aria-label = "Dismiss notification"
                    onClick = {
                        () => setNotice(null)
                    } > ×
                    </button> </div>
                )
            }

            {
                initializing ? ( <main className = "wrap section" >
                    <Empty > Loading your website… </Empty> </main>
                ) : ( <main > { /* ---------- Home page ---------- */ }

                    {
                        page === "home" && ( <>
                            <section className = "hero" >
                            <div className = "wrap hero-grid" >
                            <div >
                            <div className = "eyebrow" >
                            FIRE SAFETY & PROTECTION </div>

                            <h1 >
                            Safety starts <br />
                            with being <br />
                            <em > prepared. </em> </h1>

                            <p >
                            Equipment, systems and support
                            for the spaces that matter.Explore fire safety products from Nirala Enterprises. </p>

                            <div className = "actions" >
                            <button type = "button"
                            onClick = {
                                () => go("products")
                            } >
                            Explore products </button>

                            <a className = "secondary button"
                            href = "tel:+919914864586" >
                            Talk to our team </a> </div>

                            <p className = "small" >
                            Based in Punjab· Fire safety· Security· Electrical supplies </p> </div>

                            <figure >
                            <img src = "/images/fire-extinguishers.webp"
                            alt = "Illustrative fire extinguisher equipment" />

                            <figcaption >
                            <span className = "eyebrow" >
                            PREPARED FOR PROTECTION </span>

                            <h3 > Your safety.Our focus. </h3> </figcaption> </figure> </div> </section>

                            <section className = "wrap section" >
                            <div className = "section-heading" >
                            <div >
                            <span className = "eyebrow" >
                            OUR PRODUCTS </span>

                            <h2 > Protection
                            for your premises. </h2> </div>

                            <button type = "button"
                            className = "secondary"
                            onClick = {
                                () => go("products")
                            } >
                            View all products </button> </div>

                            {
                                products.length ? (
                                    productCards(products.slice(0, 3))
                                ) : ( <Empty >
                                    Our product catalogue is being updated.Call us to discuss your requirements. </Empty>
                                )
                            } </section>

                            <section className = "services" >
                            <div className = "wrap section" >
                            <span className = "eyebrow" >
                            WHAT WE DO </span>

                            <h2 > More than equipment. </h2>

                            <div className = "three-grid" > {
                                [
                                    [
                                        "/images/hydrant-system.webp",
                                        "Hydrant systems",
                                        "Discuss fire hydrant requirements for your building or facility.",
                                    ],
                                    [
                                        "/images/fire-alarm.webp",
                                        "Detection & alarms",
                                        "Smoke detection and fire alarm equipment for your premises.",
                                    ],
                                    [
                                        "/images/fire-extinguishers.webp",
                                        "Extinguisher refilling",
                                        "Contact us with extinguisher type, capacity and quantity.",
                                    ],
                                ].map(([image, title, description]) => ( <article className = "service"
                                    key = { title } >
                                    <img src = { image }
                                    alt = { title }
                                    loading = "lazy" />

                                    <div >
                                    <h3 > { title } </h3> <p > { description } </p>

                                    <a href = "tel:+919914864586" >
                                    Discuss requirements </a> </div> </article>
                                ))
                            } </div>

                            <p className = "muted" >
                            Also dealing in CCTV cameras, electrical goods and accessories. </p> </div> </section>

                            <section className = "wrap section" >
                            <span className = "eyebrow" >
                            ABOUT NIRALA ENTERPRISES </span>

                            <h2 > Our business is your safety. </h2>

                            <p className = "intro" >
                            We supply fire safety equipment and related security and electrical products.Browse the catalogue, place an order request, and our team will contact you to confirm availability,
                            delivery and final charges.No online payment is collected. </p> </section>

                            { /* Home: clients */ }

                            <section className = "services" >
                            <div className = "wrap section" >
                            <div className = "section-heading" >
                            <div >
                            <span className = "eyebrow" >
                            BUSINESS RELATIONSHIPS </span>

                            <h2 > Our clients </h2> <p > Organisations we work with. </p> </div>

                            <button type = "button"
                            className = "secondary"
                            onClick = {
                                () => go("clients")
                            } >
                            View all clients </button> </div>

                            <ClientCards clients = { clients.slice(0, 8) }
                            /> </div> </section>

                            { /* Home: testimonials */ }

                            <section className = "wrap section" >
                            <div className = "section-heading" >
                            <div >
                            <span className = "eyebrow" >
                            CUSTOMER EXPERIENCES </span>

                            <h2 > What our customers say </h2> <p > Feedback shared by our customers. </p> </div>

                            <button type = "button"
                            className = "secondary"
                            onClick = {
                                () => go("testimonials")
                            } >
                            View all testimonials </button> </div>

                            {
                                reviews.length ? ( <div className = "two-grid" > {
                                        reviews.slice(0, 4).map((review) => ( <ReviewCard key = { review.id }
                                            review = { review }
                                            />
                                        ))
                                    } </div>
                                ) : ( <Empty >
                                    No published testimonials yet. </Empty>
                                )
                            }

                            <div className = "actions" >
                            <button type = "button"
                            onClick = {
                                () => go("testimonials")
                            } >
                            Share your experience </button> </div> </section> </>
                        )
                    }

                    { /* ---------- Products ---------- */ }

                    {
                        page === "products" && ( <section className = "wrap section" >
                            <span className = "eyebrow" >
                            FIRE SAFETY EQUIPMENT </span>

                            <h2 > Our products </h2>

                            <p >
                            Build your cart and place an order
                            for confirmation.No online payment required. </p>

                            <div className = "filters" >
                            <Field label = "Search products"
                            placeholder = "Search by name or description"
                            value = { search }
                            onChange = {
                                (event) =>
                                setSearch(event.target.value)
                            }
                            />

                            <Field label = "Category" >
                            <select value = { category }
                            onChange = {
                                (event) =>
                                setCategory(event.target.value)
                            } > {
                                [
                                    "All",
                                    ...new Set(
                                        products.map(
                                            (product) => product.category
                                        )
                                    ),
                                ].map((item) => ( <option key = { item }
                                    value = { item } > { item } </option>
                                ))
                            } </select> </Field> </div>

                            {
                                visibleProducts.length ? (
                                    productCards(visibleProducts)
                                ) : ( <Empty > {
                                        products.length ?
                                        "No matching products. Try another search." : "Products will appear here when the admin adds them."
                                    } </Empty>
                                )
                            } </section>
                        )
                    }

                    { /* ---------- Login / Signup ---------- */ }

                    {
                        page === "account" && ( <section className = "wrap section" >
                            <form className = "panel auth"
                            onSubmit = { auth } >
                            <span className = "eyebrow" >
                            YOUR ACCOUNT </span>

                            <h2 > {
                                authMode === "login" ?
                                "Welcome back." : "Create your account."
                            } </h2>

                            <p > {
                                authMode === "login" ?
                                "Customers and admin can log in here." : "Create a customer account to order and share feedback."
                            } </p>

                            {
                                authMode === "signup" && ( <Field label = "Full name"
                                    name = "name"
                                    required minLength = { 2 }
                                    maxLength = { 100 }
                                    autoComplete = "name" />
                                )
                            }

                            <Field label = "Email"
                            name = "email"
                            type = "email"
                            required autoComplete = "email" />

                            <Field label = "Password"
                            name = "password"
                            type = "password"
                            required minLength = { authMode === "signup" ? 12 : 1 }
                            maxLength = { 128 }
                            autoComplete = {
                                authMode === "signup" ?
                                "new-password" : "current-password"
                            }
                            />

                            {
                                authMode === "signup" && ( <small > Use at least 12 characters. </small>
                                )
                            }

                            <button disabled = { busy }
                            type = "submit" > {
                                busy ?
                                "Please wait…" : authMode === "login" ?
                                    "Log in" : "Create account"
                            } </button>

                            <button className = "plain link"
                            type = "button"
                            disabled = { busy }
                            onClick = {
                                () =>
                                setAuthMode(
                                    authMode === "login" ?
                                    "signup" :
                                    "login"
                                )
                            } > {
                                authMode === "login" ?
                                "New customer? Create an account" : "Already registered? Log in"
                            } </button> </form> </section>
                        )
                    }

                    { /* ---------- Cart ---------- */ }

                    {
                        page === "cart" &&
                            user ?.role === "customer" && ( <section className = "wrap section" >
                                <h2 > Your cart </h2>

                                {
                                    loading ? ( <Empty > Loading cart… </Empty>
                                    ) : !cart.length ? ( <Empty >
                                        Your cart is empty. { " " } <button type = "button"
                                        onClick = {
                                            () => go("products")
                                        } >
                                        Browse products </button> </Empty>
                                    ) : ( <div className = "checkout-grid" >
                                        <div > {
                                            cart.map(({ product, quantity }) => ( <article className = "cart-line"
                                                key = { product.id } >
                                                <ProductImage src = { product.image }
                                                name = { product.name }
                                                />

                                                <div >
                                                <h3 > { product.name } </h3>

                                                <p > { money(product.price_paise) } { " " }
                                                each </p>

                                                {
                                                    (!product.active ||
                                                        product.stock <quantity) && ( <p className = "error-text" >
                                                        Unavailable quantity.Update or remove this item. </p>
                                                    )
                                                }

                                                <div className = "quantity" >
                                                <button type = "button"
                                                className = "secondary"
                                                disabled = {
                                                    busy || quantity <= 1
                                                }
                                                aria-label = {
                                                    "Reduce " + product.name
                                                }
                                                onClick = {
                                                    () =>
                                                    cartQuantity(
                                                        product.id,
                                                        quantity - 1
                                                    )
                                                } > −
                                                </button>

                                                <span > { quantity } </span>

                                                <button type = "button"
                                                className = "secondary"
                                                disabled = {
                                                    busy ||
                                                    quantity >= product.stock ||
                                                    quantity >= 99 ||
                                                    !product.active
                                                }
                                                aria-label = {
                                                    "Increase " + product.name
                                                }
                                                onClick = {
                                                    () =>
                                                    cartQuantity(
                                                        product.id,
                                                        quantity + 1
                                                    )
                                                } >
                                                +
                                                </button>

                                                <button type = "button"
                                                className = "plain link"
                                                disabled = { busy }
                                                onClick = {
                                                    () =>
                                                    cartQuantity(product.id, 0)
                                                } >
                                                Remove </button> </div> </div>

                                                <strong > {
                                                    money(
                                                        product.price_paise * quantity
                                                    )
                                                } </strong> </article>
                                            ))
                                        }

                                        <div className = "total split" >
                                        <strong > Product total </strong> <strong > { money(total) } </strong> </div> </div>

                                        <form className = "panel"
                                        onSubmit = { checkout } >
                                        <h3 > Delivery details </h3>

                                        <Field label = "Full name"
                                        name = "name"
                                        defaultValue = { user.name }
                                        required minLength = { 2 }
                                        maxLength = { 100 }
                                        />

                                        <Field label = "Mobile number"
                                        name = "phone"
                                        type = "tel"
                                        required minLength = { 10 }
                                        maxLength = { 20 }
                                        autoComplete = "tel" />

                                        <Field label = "Full delivery address" >
                                        <textarea name = "address"
                                        required minLength = { 15 }
                                        maxLength = { 600 }
                                        rows = { 4 }
                                        placeholder = "House / building, street, city, state and PIN code" />
                                        </Field>

                                        <Field label = "Notes (optional)" >
                                        <textarea name = "notes"
                                        maxLength = { 1000 }
                                        rows = { 2 }
                                        /> </Field>

                                        <p className = "small" >
                                        Your order is a request pending confirmation.Our team will confirm delivery, final charges and payment arrangements.No payment is collected here. </p>

                                        <button type = "submit"
                                        disabled = { busy || invalidCart } > {
                                            busy ?
                                            "Placing order…" : "Place order request"
                                        } </button> </form> </div>
                                    )
                                } </section>
                            )
                    }

                    { /* ---------- Customer orders ---------- */ }

                    {
                        page === "orders" &&
                            user ?.role === "customer" && ( <section className = "wrap section" >
                                <h2 > My orders </h2> <p >
                                Follow the progress of your order requests. </p>

                                {
                                    loading ? ( <Empty > Loading orders… </Empty>
                                    ) : orders.length ? ( <div className = "two-grid" > {
                                            orders.map((order) => ( <OrderCard key = { order.id }
                                                order = { order }
                                                />
                                            ))
                                        } </div>
                                    ) : ( <Empty > No orders yet. </Empty>
                                    )
                                } </section>
                            )
                    }

                    { /* ---------- Clients page ---------- */ }

                    {
                        page === "clients" && ( <section className = "wrap section" >
                            <span className = "eyebrow" >
                            BUSINESS RELATIONSHIPS </span>

                            <h2 > Our clients </h2> <p > Organisations we work with. </p>

                            <ClientCards clients = { clients }
                            /> </section>
                        )
                    }

                    { /* ---------- Testimonials page ---------- */ }

                    {
                        page === "testimonials" && ( <section className = "wrap section" >
                            <span className = "eyebrow" >
                            CUSTOMER EXPERIENCES </span>

                            <h2 > What our customers say </h2>

                            <div className = "review-layout" >
                            <div > {
                                reviews.length ? (
                                    reviews.map((review) => ( <ReviewCard key = { review.id }
                                        review = { review }
                                        />
                                    ))
                                ) : ( <Empty >
                                    No published testimonials yet. </Empty>
                                )
                            } </div>

                            {
                                user ?.role === "customer" ? ( <form className = "panel"
                                    onSubmit = { submitReview } >
                                    <h3 > {
                                        mine ?
                                        "Update your testimonial" : "Share your experience"
                                    } </h3>

                                    {
                                        mine && ( <p >
                                            Your review status: { " " } <strong > { mine.status } </strong> </p>
                                        )
                                    }

                                    <Field label = "Rating" >
                                    <select value = { reviewForm.rating }
                                    onChange = {
                                        (event) =>
                                        setReviewForm({
                                            ...reviewForm,
                                            rating: event.target.value,
                                        })
                                    } > {
                                        [5, 4, 3, 2, 1].map((rating) => ( <option key = { rating }
                                            value = { rating } > { rating }
                                            stars </option>
                                        ))
                                    } </select> </Field>

                                    <Field label = "Your experience" >
                                    <textarea rows = { 5 }
                                    required minLength = { 10 }
                                    maxLength = { 1500 }
                                    value = { reviewForm.comment }
                                    onChange = {
                                        (event) =>
                                        setReviewForm({
                                            ...reviewForm,
                                            comment: event.target.value,
                                        })
                                    }
                                    /> </Field>

                                    <p className = "small" >
                                    Your name and review will be public after admin approval.Editing a review sends it
                                    for approval again. </p>

                                    <button type = "submit"
                                    disabled = { busy } >
                                    Submit
                                    for approval </button> </form>
                                ) : ( <div className = "panel" >
                                    <h3 > Share your feedback </h3>

                                    <p >
                                    Customer accounts can submit testimonials
                                    for review. </p>

                                    {
                                        !user && ( <button type = "button"
                                            onClick = {
                                                () => go("account")
                                            } >
                                            Log in to write a review </button>
                                        )
                                    } </div>
                                )
                            } </div> </section>
                        )
                    }

                    { /* ---------- Admin dashboard ---------- */ }

                    {
                        page === "admin" &&
                            user ?.role === "admin" && ( <section className = "wrap section" >
                                <div className = "section-heading" >
                                <div >
                                <span className = "eyebrow" >
                                ADMIN WORKSPACE </span>

                                <h2 > Hello, { user.name }. </h2> </div>

                                <button type = "button"
                                className = "secondary"
                                disabled = { busy }
                                onClick = {
                                    () =>
                                    run(refresh, "Dashboard refreshed.")
                                } >
                                Refresh </button> </div>

                                <div className = "stats" >
                                <div >
                                <strong > {
                                    adminProducts.filter(
                                        (product) => product.active
                                    ).length
                                } </strong>
                                Active products </div>

                                <div >
                                <strong > {
                                    adminOrders.filter(
                                        (order) =>
                                        order.status ===
                                        "Pending confirmation"
                                    ).length
                                } </strong>
                                Pending orders </div>

                                <div >
                                <strong > {
                                    adminReviews.filter(
                                        (review) =>
                                        review.status === "pending"
                                    ).length
                                } </strong>
                                Reviews to approve </div>

                                <div >
                                <strong > { clients.length } </strong>
                                Clients </div> </div>

                                <div className = "tabs" > {
                                    [
                                        "products",
                                        "orders",
                                        "clients",
                                        "testimonials",
                                    ].map((item) => ( <button type = "button"
                                        key = { item }
                                        className = {
                                            tab === item ? "" : "secondary"
                                        }
                                        onClick = {
                                            () => setTab(item)
                                        } > { item } </button>
                                    ))
                                } </div>

                                {
                                    loading ? ( <Empty > Loading dashboard… </Empty>
                                    ) : ( <>
                                        { /* Admin: products */ }

                                        {
                                            tab === "products" && ( <div className = "admin-grid" >
                                                <form className = "panel"
                                                onSubmit = { saveProduct } >
                                                <h3 > {
                                                    productForm.id ?
                                                    "Edit product" : "Add product"
                                                } </h3>

                                                <Field label = "Product name"
                                                value = { productForm.name }
                                                required minLength = { 2 }
                                                maxLength = { 150 }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        name: event.target.value,
                                                    })
                                                }
                                                />

                                                <Field label = "Category"
                                                value = { productForm.category }
                                                required minLength = { 2 }
                                                maxLength = { 80 }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        category: event.target.value,
                                                    })
                                                }
                                                />

                                                <Field label = "Description" >
                                                <textarea rows = { 3 }
                                                required minLength = { 5 }
                                                maxLength = { 3000 }
                                                value = { productForm.description }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        description: event.target.value,
                                                    })
                                                }
                                                /> </Field>

                                                <div className = "two-grid" >
                                                <Field label = "Price (₹)"
                                                type = "number"
                                                required min = "0.01"
                                                max = "1000000"
                                                step = "0.01"
                                                value = { productForm.price }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        price: event.target.value,
                                                    })
                                                }
                                                />

                                                <Field label = "Available stock"
                                                type = "number"
                                                required min = "0"
                                                max = "100000"
                                                step = "1"
                                                value = { productForm.stock }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        stock: event.target.value,
                                                    })
                                                }
                                                /> </div>

                                                <small >
                                                Stock means units available after existing order reservations. </small>

                                                <Field label = "Upload product photo (max 5 MB)"
                                                type = "file"
                                                accept = "image/png,image/jpeg,image/webp"
                                                disabled = { busy }
                                                onChange = {
                                                    (event) =>
                                                    upload(
                                                        event,
                                                        setProductForm,
                                                        "image"
                                                    )
                                                }
                                                />

                                                <Field label = "Or choose an illustrative image" >
                                                <select value = {
                                                    productForm.image.startsWith(
                                                        "/images/"
                                                    ) ?
                                                    productForm.image : ""
                                                }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        image: event.target.value,
                                                    })
                                                } >
                                                <option value = "" >
                                                Select / no bundled image </option>

                                                <option value = "/images/fire-extinguishers.webp" >
                                                Fire extinguishers </option>

                                                <option value = "/images/hydrant-system.webp" >
                                                Hydrant system </option>

                                                <option value = "/images/fire-alarm.webp" >
                                                Fire alarm </option> </select> </Field>

                                                {
                                                    productForm.image && ( <img className = "upload-preview"
                                                        src = { productForm.image }
                                                        alt = "Product preview" />
                                                    )
                                                }

                                                <label className = "check" >
                                                <input type = "checkbox"
                                                checked = { productForm.active }
                                                onChange = {
                                                    (event) =>
                                                    setProductForm({
                                                        ...productForm,
                                                        active: event.target.checked,
                                                    })
                                                }
                                                />
                                                Visible in catalogue </label>

                                                <div className = "actions" >
                                                <button type = "submit"
                                                disabled = { busy } >
                                                Save product </button>

                                                <button type = "button"
                                                className = "secondary"
                                                disabled = { busy }
                                                onClick = {
                                                    () =>
                                                    setProductForm({
                                                        ...emptyProduct,
                                                    })
                                                } >
                                                Clear form </button> </div> </form>

                                                <div > {
                                                    adminProducts.length ? (
                                                        adminProducts.map((product) => ( <article className = "admin-row"
                                                            key = { product.id } >
                                                            <ProductImage src = { product.image }
                                                            name = { product.name }
                                                            />

                                                            <div >
                                                            <h3 > { product.name } </h3>

                                                            <p > {
                                                                money(
                                                                    product.price_paise
                                                                )
                                                            } { " · " }
                                                            Stock: { product.stock } { " · " } {
                                                                product.active ?
                                                                    "Active" :
                                                                    "Archived"
                                                            } </p>

                                                            <div className = "actions" >
                                                            <button type = "button"
                                                            className = "secondary"
                                                            disabled = { busy }
                                                            onClick = {
                                                                () =>
                                                                editProduct(product)
                                                            } >
                                                            Edit </button>

                                                            {
                                                                product.active && ( <button type = "button"
                                                                    className = "danger"
                                                                    disabled = { busy }
                                                                    onClick = {
                                                                        () =>
                                                                        archiveProduct(
                                                                            product.id
                                                                        )
                                                                    } >
                                                                    Archive </button>
                                                                )
                                                            } </div> </div> </article>
                                                        ))
                                                    ) : ( <Empty >
                                                        Add your first product using this form. </Empty>
                                                    )
                                                } </div> </div>
                                            )
                                        }

                                        { /* Admin: orders */ }

                                        {
                                            tab === "orders" &&
                                                (adminOrders.length ? ( <div className = "two-grid" > {
                                                        adminOrders.map((order) => ( <OrderCard key = { order.id }
                                                            order = { order }
                                                            admin busy = { busy }
                                                            onStatus = { updateOrderStatus }
                                                            />
                                                        ))
                                                    } </div>
                                                ) : ( <Empty >
                                                    Customer orders will appear here. </Empty>
                                                ))
                                        }

                                        { /* Admin: clients */ }

                                        {
                                            tab === "clients" && ( <div className = "admin-grid" >
                                                <form className = "panel"
                                                onSubmit = { saveClient } >
                                                <h3 > {
                                                    clientForm.id ?
                                                    "Edit client" : "Add client"
                                                } </h3>

                                                <Field label = "Company name"
                                                required minLength = { 2 }
                                                maxLength = { 150 }
                                                value = { clientForm.name }
                                                onChange = {
                                                    (event) =>
                                                    setClientForm({
                                                        ...clientForm,
                                                        name: event.target.value,
                                                    })
                                                }
                                                />

                                                <Field label = "Company logo (max 5 MB)"
                                                type = "file"
                                                accept = "image/png,image/jpeg,image/webp"
                                                disabled = { busy }
                                                onChange = {
                                                    (event) =>
                                                    upload(
                                                        event,
                                                        setClientForm,
                                                        "logo"
                                                    )
                                                }
                                                />

                                                {
                                                    clientForm.logo && ( <img className = "upload-preview"
                                                        src = { clientForm.logo }
                                                        alt = "Client logo preview" />
                                                    )
                                                }

                                                <div className = "actions" >
                                                <button type = "submit"
                                                disabled = { busy } >
                                                Save client </button>

                                                <button type = "button"
                                                className = "secondary"
                                                disabled = { busy }
                                                onClick = {
                                                    () =>
                                                    setClientForm({
                                                        ...emptyClient,
                                                    })
                                                } >
                                                Clear form </button> </div> </form>

                                                <div > {
                                                    clients.length ? (
                                                        clients.map((client) => ( <article className = "admin-row"
                                                            key = { client.id } > {
                                                                client.logo && ( <img src = { client.logo }
                                                                    alt = { client.name }
                                                                    />
                                                                )
                                                            }

                                                            <div >
                                                            <h3 > { client.name } </h3>

                                                            <div className = "actions" >
                                                            <button type = "button"
                                                            className = "secondary"
                                                            disabled = { busy }
                                                            onClick = {
                                                                () =>
                                                                setClientForm({
                                                                    id: client.id,
                                                                    name: client.name,
                                                                    logo: client.logo,
                                                                })
                                                            } >
                                                            Edit </button>

                                                            <button type = "button"
                                                            className = "danger"
                                                            disabled = { busy }
                                                            onClick = {
                                                                () =>
                                                                deleteClient(client)
                                                            } >
                                                            Delete </button> </div> </div> </article>
                                                        ))
                                                    ) : ( <Empty >
                                                        No clients added yet. </Empty>
                                                    )
                                                } </div> </div>
                                            )
                                        }

                                        { /* Admin: testimonials */ }

                                        {
                                            tab === "testimonials" &&
                                                (adminReviews.length ? ( <div className = "two-grid" > {
                                                        adminReviews.map((review) => ( <article className = "review"
                                                            key = { review.id } >
                                                            <div className = "split" >
                                                            <strong > { review.name } </strong>

                                                            <span className = "badge" > { review.status } </span> </div>

                                                            <span className = "stars"
                                                            aria-label = { `${review.rating} out of 5 stars` } > { "★".repeat(review.rating) } </span>

                                                            <p > { review.comment } </p>

                                                            <div className = "actions" >
                                                            <button type = "button"
                                                            disabled = {
                                                                busy ||
                                                                review.status ===
                                                                "approved"
                                                            }
                                                            onClick = {
                                                                () =>
                                                                moderateReview(
                                                                    review.id,
                                                                    "approved"
                                                                )
                                                            } >
                                                            Approve </button>

                                                            <button type = "button"
                                                            className = "danger"
                                                            disabled = {
                                                                busy ||
                                                                review.status ===
                                                                "rejected"
                                                            }
                                                            onClick = {
                                                                () =>
                                                                moderateReview(
                                                                    review.id,
                                                                    "rejected"
                                                                )
                                                            } >
                                                            Reject </button> </div> </article>
                                                        ))
                                                    } </div>
                                                ) : ( <Empty >
                                                    No customer testimonials to review. </Empty>
                                                ))
                                        } </>
                                    )
                                } </section>
                            )
                    } </main>
                )
            }

            { /* ---------- Footer ---------- */ }

            <footer >
            <div className = "wrap footer-grid" >
            <div >
            <h3 > Nirala Enterprises </h3>

            <p >
            Providing safety. <br />
            Protecting what matters. </p> </div>

            <div >
            <strong > Contact our team </strong>

            <a href = "tel:+919914864586" >
            +91 99148 64586 </a>

            <a href = "tel:+919914779653" >
            +91 99147 79653 </a>

            <a href = "mailto:niralafireservice@gmail.com" >
            niralafireservice @gmail.com </a> </div>

            <div >
            <strong > Visit us </strong>

            <p >
            Plot No .6, Office No .2, Jangra Complex, <br />
            Dera Bassi Road, SAS Nagar, <br />
            Punjab– 140604 </p> </div> </div>

            <div className = "wrap footer-bottom" > ©{ new Date().getFullYear() }
            Nirala Enterprises· Orders subject to confirmation. </div> </footer> </>
        );
    }