import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { track } from "@/lib/track";
import Admin from "@/pages/admin";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Shop from "@/pages/shop";
import ShopProduct from "@/pages/shop-product";
import ShopSuccess from "@/pages/shop-success";
import { CartProvider } from "@/context/cart";
import { CartDrawer } from "@/components/cart-drawer";

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  useEffect(() => { track(location); }, [location]);
  return (
    <Switch>
      <Route path="/admin" component={Admin} />
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/shop/success" component={ShopSuccess} />
      <Route path="/shop/:productId" component={ShopProduct} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <CartDrawer />
          <Toaster />
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
