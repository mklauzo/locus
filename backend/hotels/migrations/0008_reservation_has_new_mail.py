from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0007_aiassistant_ollama_url_default'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='has_new_mail',
            field=models.BooleanField(default=False),
        ),
    ]
