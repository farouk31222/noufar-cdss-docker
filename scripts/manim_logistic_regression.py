"""
Animation Manim — Régression Logistique
========================================

Installation :
    pip install manim

Lancer (qualité moyenne) :
    manim -pqm scripts/manim_logistic_regression.py LogisticRegressionScene

Qualités possibles : -pql (low), -pqm (medium), -pqh (high), -pqk (4K)
"""

import numpy as np
from manim import *


# ----------------------------------------------------------------------
# Couleurs
# ----------------------------------------------------------------------
C_POS = "#2ECC71"      # classe 1
C_NEG = "#E74C3C"      # classe 0
C_SIG = "#3498DB"      # courbe sigmoïde
C_LIN = "#F1C40F"      # ligne linéaire
C_HL  = "#9B59B6"      # surlignage


# ----------------------------------------------------------------------
# Scène 1 — Titre
# ----------------------------------------------------------------------
class S1_Titre(Scene):
    def construct(self):
        titre = Text("Régression Logistique", font_size=64, weight=BOLD)
        sous = Text("Classification binaire — pas à pas",
                    font_size=32, color=GREY_B).next_to(titre, DOWN, buff=0.4)

        self.play(Write(titre), run_time=1.5)
        self.play(FadeIn(sous, shift=UP * 0.2))
        self.wait(1.5)
        self.play(FadeOut(VGroup(titre, sous)))


# ----------------------------------------------------------------------
# Scène 2 — Le problème : classifier
# ----------------------------------------------------------------------
class S2_Probleme(Scene):
    def construct(self):
        titre = Text("Le problème : classer en 0 ou 1",
                     font_size=40).to_edge(UP)
        self.play(Write(titre))

        axes = Axes(
            x_range=[-1, 11, 2],
            y_range=[-0.3, 1.3, 0.5],
            x_length=9,
            y_length=4,
            axis_config={"include_tip": False, "color": GREY_B},
        ).shift(DOWN * 0.3)

        x_lbl = axes.get_x_axis_label("x  (ex: dose)", edge=DOWN, direction=DOWN)
        y_lbl = axes.get_y_axis_label("y", edge=LEFT, direction=LEFT)

        self.play(Create(axes), FadeIn(x_lbl), FadeIn(y_lbl))

        # Points classe 0 (y=0)
        x0 = [0.5, 1.2, 2.0, 2.8, 3.6, 4.1]
        # Points classe 1 (y=1)
        x1 = [5.8, 6.5, 7.4, 8.1, 9.0, 9.7]

        dots0 = VGroup(*[
            Dot(axes.c2p(x, 0), color=C_NEG, radius=0.10) for x in x0
        ])
        dots1 = VGroup(*[
            Dot(axes.c2p(x, 1), color=C_POS, radius=0.10) for x in x1
        ])

        leg0 = VGroup(Dot(color=C_NEG, radius=0.10),
                      Text("y = 0  (négatif)", font_size=24)).arrange(RIGHT, buff=0.2)
        leg1 = VGroup(Dot(color=C_POS, radius=0.10),
                      Text("y = 1  (positif)", font_size=24)).arrange(RIGHT, buff=0.2)
        legende = VGroup(leg0, leg1).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        legende.to_corner(UR).shift(DOWN * 0.6 + LEFT * 0.2)

        self.play(LaggedStartMap(FadeIn, dots0, shift=UP * 0.2), run_time=1.2)
        self.play(LaggedStartMap(FadeIn, dots1, shift=DOWN * 0.2), run_time=1.2)
        self.play(FadeIn(legende))
        self.wait(1)

        q = Text("Comment prédire la classe pour un nouveau x ?",
                 font_size=28, color=YELLOW).to_edge(DOWN)
        self.play(Write(q))
        self.wait(2)
        self.play(FadeOut(VGroup(titre, axes, x_lbl, y_lbl,
                                 dots0, dots1, legende, q)))


# ----------------------------------------------------------------------
# Scène 3 — Pourquoi pas la régression linéaire ?
# ----------------------------------------------------------------------
class S3_PourquoiPasLineaire(Scene):
    def construct(self):
        titre = Text("Pourquoi pas une droite ?", font_size=40).to_edge(UP)
        self.play(Write(titre))

        axes = Axes(
            x_range=[-1, 11, 2],
            y_range=[-0.5, 1.5, 0.5],
            x_length=9, y_length=4.2,
            axis_config={"include_tip": False, "color": GREY_B},
        ).shift(DOWN * 0.3)
        self.play(Create(axes))

        x0 = [0.5, 1.2, 2.0, 2.8, 3.6, 4.1]
        x1 = [5.8, 6.5, 7.4, 8.1, 9.0, 9.7]
        dots = VGroup(
            *[Dot(axes.c2p(x, 0), color=C_NEG, radius=0.10) for x in x0],
            *[Dot(axes.c2p(x, 1), color=C_POS, radius=0.10) for x in x1],
        )
        self.play(FadeIn(dots))

        # Droite ajustée (approximative)
        a, b = 0.13, -0.15
        ligne = axes.plot(lambda x: a * x + b, x_range=[-1, 11], color=C_LIN)
        eq = MathTex("y = a x + b", color=C_LIN, font_size=36).to_corner(UL).shift(DOWN * 0.8 + RIGHT * 0.3)

        self.play(Create(ligne), Write(eq))
        self.wait(1)

        # Problèmes
        p1 = MathTex(r"y \;\notin\; [0, 1]", color=RED, font_size=36)
        p2 = MathTex(r"\text{très sensible aux points extrêmes}",
                     color=RED, font_size=28)
        probs = VGroup(p1, p2).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        probs.to_edge(DOWN).shift(UP * 0.2)
        self.play(Write(p1))
        self.wait(0.7)
        self.play(Write(p2))
        self.wait(2)

        self.play(FadeOut(VGroup(titre, axes, dots, ligne, eq, probs)))


# ----------------------------------------------------------------------
# Scène 4 — La fonction Sigmoïde
# ----------------------------------------------------------------------
class S4_Sigmoide(Scene):
    def construct(self):
        titre = Text("La fonction sigmoïde", font_size=42).to_edge(UP)
        self.play(Write(titre))

        formule = MathTex(
            r"\sigma(z) \;=\; \frac{1}{1 + e^{-z}}",
            font_size=52, color=C_SIG
        )
        self.play(Write(formule))
        self.wait(1.5)
        self.play(formule.animate.scale(0.7).to_corner(UL).shift(DOWN * 0.6))

        axes = Axes(
            x_range=[-6, 6, 2],
            y_range=[-0.2, 1.2, 0.5],
            x_length=9, y_length=4.5,
            axis_config={"include_tip": False, "color": GREY_B},
            y_axis_config={"include_numbers": True,
                           "decimal_number_config": {"num_decimal_places": 1}},
            x_axis_config={"include_numbers": True},
        ).shift(DOWN * 0.3)
        x_lbl = axes.get_x_axis_label("z")
        y_lbl = axes.get_y_axis_label(r"\sigma(z)")
        self.play(Create(axes), FadeIn(x_lbl), FadeIn(y_lbl))

        sig = axes.plot(lambda z: 1 / (1 + np.exp(-z)),
                        x_range=[-6, 6], color=C_SIG, stroke_width=4)
        self.play(Create(sig), run_time=2)
        self.wait(0.5)

        # Asymptotes
        as0 = DashedLine(axes.c2p(-6, 0), axes.c2p(6, 0), color=GREY_B)
        as1 = DashedLine(axes.c2p(-6, 1), axes.c2p(6, 1), color=GREY_B)
        self.play(Create(as0), Create(as1))

        # Point milieu
        pt = Dot(axes.c2p(0, 0.5), color=C_HL, radius=0.12)
        lbl = MathTex(r"\sigma(0) = 0{,}5", font_size=30, color=C_HL)\
            .next_to(pt, UR, buff=0.15)
        self.play(GrowFromCenter(pt), Write(lbl))
        self.wait(1)

        # Propriétés
        prop = VGroup(
            MathTex(r"z \to +\infty \;\Rightarrow\; \sigma(z) \to 1",
                    font_size=28, color=C_POS),
            MathTex(r"z \to -\infty \;\Rightarrow\; \sigma(z) \to 0",
                    font_size=28, color=C_NEG),
            MathTex(r"\sigma(z) \in (0, 1) \;\;\Rightarrow\;\;\text{probabilité !}",
                    font_size=28, color=YELLOW),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2).to_edge(RIGHT).shift(LEFT * 0.2)

        for p in prop:
            self.play(Write(p))
            self.wait(0.4)
        self.wait(1.5)

        self.play(FadeOut(VGroup(titre, formule, axes, x_lbl, y_lbl,
                                 sig, as0, as1, pt, lbl, prop)))


# ----------------------------------------------------------------------
# Scène 5 — Le modèle complet
# ----------------------------------------------------------------------
class S5_Modele(Scene):
    def construct(self):
        titre = Text("Le modèle de régression logistique",
                     font_size=40).to_edge(UP)
        self.play(Write(titre))

        # Étape 1 : combinaison linéaire
        e1_t = Text("1) Combinaison linéaire", font_size=28, color=C_LIN)\
            .to_edge(LEFT).shift(UP * 1.5)
        e1 = MathTex(r"z \;=\; w_0 + w_1 x_1 + w_2 x_2 + \dots + w_n x_n",
                     font_size=40, color=C_LIN)
        e1.next_to(e1_t, DOWN, buff=0.3, aligned_edge=LEFT)
        self.play(Write(e1_t))
        self.play(Write(e1))
        self.wait(1)

        # Étape 2 : sigmoïde
        e2_t = Text("2) On écrase entre 0 et 1", font_size=28, color=C_SIG)\
            .next_to(e1, DOWN, buff=0.7, aligned_edge=LEFT)
        e2 = MathTex(r"\hat{p} \;=\; \sigma(z) \;=\; \frac{1}{1 + e^{-z}}",
                     font_size=40, color=C_SIG)
        e2.next_to(e2_t, DOWN, buff=0.3, aligned_edge=LEFT)
        self.play(Write(e2_t))
        self.play(Write(e2))
        self.wait(1)

        # Étape 3 : décision
        e3_t = Text("3) Décision (seuil = 0,5)", font_size=28, color=C_HL)\
            .next_to(e2, DOWN, buff=0.7, aligned_edge=LEFT)
        e3 = MathTex(
            r"\hat{y} \;=\; \begin{cases} 1 & \text{si } \hat{p} \geq 0{,}5 \\ 0 & \text{sinon} \end{cases}",
            font_size=36, color=C_HL,
        ).next_to(e3_t, DOWN, buff=0.2, aligned_edge=LEFT)
        self.play(Write(e3_t))
        self.play(Write(e3))
        self.wait(2.5)

        self.play(FadeOut(VGroup(titre, e1_t, e1, e2_t, e2, e3_t, e3)))


# ----------------------------------------------------------------------
# Scène 6 — Frontière de décision
# ----------------------------------------------------------------------
class S6_Frontiere(Scene):
    def construct(self):
        titre = Text("Frontière de décision (2D)", font_size=40).to_edge(UP)
        self.play(Write(titre))

        plane = NumberPlane(
            x_range=[-5, 5, 1], y_range=[-3, 3, 1],
            x_length=9, y_length=5.4,
            background_line_style={"stroke_opacity": 0.3},
        ).shift(DOWN * 0.3)
        self.play(Create(plane))

        # Données simulées séparables
        rng = np.random.default_rng(7)
        n = 24
        # classe 0 (en bas à gauche)
        p0 = rng.normal(loc=[-1.5, -0.8], scale=[0.7, 0.6], size=(n, 2))
        # classe 1 (en haut à droite)
        p1 = rng.normal(loc=[1.5, 0.8], scale=[0.7, 0.6], size=(n, 2))

        dots0 = VGroup(*[
            Dot(plane.c2p(p[0], p[1]), color=C_NEG, radius=0.08) for p in p0
        ])
        dots1 = VGroup(*[
            Dot(plane.c2p(p[0], p[1]), color=C_POS, radius=0.08) for p in p1
        ])
        self.play(LaggedStartMap(FadeIn, dots0), LaggedStartMap(FadeIn, dots1))
        self.wait(0.5)

        # Frontière : w0 + w1 x + w2 y = 0  ->  y = -(w0 + w1 x)/w2
        w0, w1, w2 = -0.2, 1.0, 1.5
        ligne = plane.plot(
            lambda x: -(w0 + w1 * x) / w2,
            x_range=[-5, 5], color=C_HL, stroke_width=4,
        )
        eq = MathTex(r"w_0 + w_1 x_1 + w_2 x_2 \;=\; 0",
                     font_size=32, color=C_HL).to_corner(UR).shift(DOWN * 0.6 + LEFT * 0.2)

        self.play(Create(ligne), Write(eq))
        self.wait(1)

        note = Text("À gauche : p̂ < 0,5  →  classe 0       "
                    "À droite : p̂ ≥ 0,5  →  classe 1",
                    font_size=24, color=YELLOW).to_edge(DOWN)
        self.play(Write(note))
        self.wait(2.5)

        self.play(FadeOut(VGroup(titre, plane, dots0, dots1, ligne, eq, note)))


# ----------------------------------------------------------------------
# Scène 7 — Fonction de coût (log-loss)
# ----------------------------------------------------------------------
class S7_Cout(Scene):
    def construct(self):
        titre = Text("Comment apprendre les poids ? — Log-loss",
                     font_size=36).to_edge(UP)
        self.play(Write(titre))

        intro = Text("Pour un exemple (x, y) avec y ∈ {0, 1} :",
                     font_size=28).next_to(titre, DOWN, buff=0.4)
        self.play(FadeIn(intro))

        cout = MathTex(
            r"\mathcal{L}(\hat{p}, y) \;=\; -\,\big[\, y\,\log(\hat{p}) \;+\; (1-y)\,\log(1-\hat{p}) \,\big]",
            font_size=38,
        ).next_to(intro, DOWN, buff=0.5)
        self.play(Write(cout))
        self.wait(1.5)

        # Deux cas
        cas1 = MathTex(r"y = 1 \;\Rightarrow\; \mathcal{L} = -\log(\hat{p})",
                       font_size=34, color=C_POS)
        cas0 = MathTex(r"y = 0 \;\Rightarrow\; \mathcal{L} = -\log(1-\hat{p})",
                       font_size=34, color=C_NEG)
        cas = VGroup(cas1, cas0).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        cas.next_to(cout, DOWN, buff=0.7)

        self.play(Write(cas1))
        self.wait(0.5)
        self.play(Write(cas0))
        self.wait(1.5)

        # Coût total
        total = MathTex(
            r"J(w) \;=\; \frac{1}{m}\sum_{i=1}^{m} \mathcal{L}\!\left(\hat{p}^{(i)}, y^{(i)}\right)",
            font_size=36, color=YELLOW,
        ).to_edge(DOWN).shift(UP * 0.3)
        self.play(Write(total))
        self.wait(2.5)

        self.play(FadeOut(VGroup(titre, intro, cout, cas, total)))


# ----------------------------------------------------------------------
# Scène 8 — Descente de gradient (intuition)
# ----------------------------------------------------------------------
class S8_Gradient(Scene):
    def construct(self):
        titre = Text("Apprentissage : descente de gradient",
                     font_size=38).to_edge(UP)
        self.play(Write(titre))

        axes = Axes(
            x_range=[-3, 3, 1],
            y_range=[0, 6, 1],
            x_length=9, y_length=4.5,
            axis_config={"include_tip": False, "color": GREY_B},
        ).shift(DOWN * 0.3)
        x_lbl = axes.get_x_axis_label("w")
        y_lbl = axes.get_y_axis_label("J(w)")
        self.play(Create(axes), FadeIn(x_lbl), FadeIn(y_lbl))

        f = lambda w: 0.6 * w ** 2 + 0.5
        courbe = axes.plot(f, x_range=[-3, 3], color=C_SIG, stroke_width=4)
        self.play(Create(courbe))

        # Bille qui descend
        steps = [-2.5, -1.8, -1.2, -0.75, -0.4, -0.18, -0.05, 0.0]
        ball = Dot(axes.c2p(steps[0], f(steps[0])), color=C_HL, radius=0.14)
        self.play(GrowFromCenter(ball))

        regle = MathTex(
            r"w \;\leftarrow\; w \;-\; \alpha \,\frac{\partial J}{\partial w}",
            font_size=34, color=C_HL,
        ).to_corner(UR).shift(DOWN * 0.4 + LEFT * 0.2)
        self.play(Write(regle))

        for w in steps[1:]:
            self.play(ball.animate.move_to(axes.c2p(w, f(w))),
                      run_time=0.55)
        self.wait(0.5)

        note = Text("On répète jusqu'à atteindre le minimum.",
                    font_size=26, color=YELLOW).to_edge(DOWN)
        self.play(Write(note))
        self.wait(2)

        self.play(FadeOut(VGroup(titre, axes, x_lbl, y_lbl,
                                 courbe, ball, regle, note)))


# ----------------------------------------------------------------------
# Scène 9 — Récapitulatif
# ----------------------------------------------------------------------
class S9_Recap(Scene):
    def construct(self):
        titre = Text("Récapitulatif", font_size=48, weight=BOLD).to_edge(UP)
        self.play(Write(titre))

        items = VGroup(
            Text("• z = w₀ + w₁x₁ + … + wₙxₙ", font_size=30, color=C_LIN),
            Text("• p̂ = σ(z) ∈ (0, 1)  (probabilité)", font_size=30, color=C_SIG),
            Text("• ŷ = 1 si p̂ ≥ 0,5, sinon 0", font_size=30, color=C_HL),
            Text("• Coût : log-loss  J(w)", font_size=30, color=YELLOW),
            Text("• Optimisation : descente de gradient", font_size=30, color=C_POS),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.35).next_to(titre, DOWN, buff=0.6)

        for it in items:
            self.play(FadeIn(it, shift=RIGHT * 0.3))
            self.wait(0.25)
        self.wait(2)

        fin = Text("Merci !", font_size=44, color=C_POS).to_edge(DOWN)
        self.play(Write(fin))
        self.wait(2)


# ----------------------------------------------------------------------
# Scène globale — toutes les scènes en une vidéo
# ----------------------------------------------------------------------
class LogisticRegressionScene(Scene):
    """Lance toutes les scènes à la suite (une seule vidéo)."""

    def construct(self):
        for cls in (S1_Titre, S2_Probleme, S3_PourquoiPasLineaire,
                    S4_Sigmoide, S5_Modele, S6_Frontiere,
                    S7_Cout, S8_Gradient, S9_Recap):
            cls.construct(self)
