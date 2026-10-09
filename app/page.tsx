import Header from "@/components/Header";
import Hero from "@/components/Hero";
import WhyUs from "@/components/WhyUs";
import Services from "@/components/Services";
import CoverageArea from "@/components/CoverageArea";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhyUs />
        <Services />
        <CoverageArea />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
